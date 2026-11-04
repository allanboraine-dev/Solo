import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminRequest } from '../../../../utils/adminAuth.ts';
import { isPlatformOwner } from '../../../../utils/owner.ts';
import {
  saveKycDriverProfile,
  recordDriverSignupAlert,
  checkDuplicateKycDriver,
  reconcileMemoryDriversWithDatabase,
} from '../../../../utils/kycStore.ts';
import { checkDriverDuplicatesInMemory } from '../../../../utils/driverValidation.ts';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';
const rawServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SECRET_KEY;

const isServiceRoleKey = (key?: string): boolean => {
  if (!key || key === 'mock-key') return false;
  if (key.startsWith('sb_secret_')) return true;
  if (key.startsWith('sb_publishable_')) return false;
  try {
    const parts = key.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      return payload.role === 'service_role';
    }
  } catch {}
  return true;
};

const hasServiceRoleKey = isServiceRoleKey(rawServiceKey);
const serviceKey = rawServiceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-key';

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function generateSecureDriverPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  const specials = '@#$!';

  let pass = 'Solo';
  pass += specials.charAt(Math.floor(Math.random() * specials.length));
  for (let i = 0; i < 4; i++) {
    pass += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }
  pass += specials.charAt(Math.floor(Math.random() * specials.length));
  pass += upper.charAt(Math.floor(Math.random() * upper.length));
  pass += chars.charAt(Math.floor(Math.random() * chars.length));
  return pass;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authorize manager request
    const auth = await validateAdminRequest(req);
    if (!auth.authorized) {
      return Response.json(
        { error: 'Unauthorized: Manager credentials required', reason: auth.reason },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      fullName,
      email,
      phone,
      password: customPassword,
      vehicleMake,
      vehicleModel,
      vehicleYear,
      vehicleColor,
      licensePlate,
      prdpNumber,
      isVerified = true,
      subscriptionPlan = 'trial',
      hasLicense = true,
      hasPrdp = true,
      hasRoadworthy = true,
      trialStartedAt,
    } = body;

    // 2. Validate required fields
    if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
      return Response.json(
        { error: 'Driver full name is required.', field: 'fullName' },
        { status: 400 }
      );
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return Response.json(
        { error: 'A valid email address is required.', field: 'email' },
        { status: 400 }
      );
    }

    if (!phone || typeof phone !== 'string' || phone.trim().length < 7) {
      return Response.json(
        { error: 'A valid contact phone number is required.', field: 'phone' },
        { status: 400 }
      );
    }

    if (!vehicleMake || typeof vehicleMake !== 'string' || !vehicleMake.trim()) {
      return Response.json(
        { error: 'Vehicle make is required (e.g. Toyota).', field: 'vehicleMake' },
        { status: 400 }
      );
    }

    if (!vehicleModel || typeof vehicleModel !== 'string' || !vehicleModel.trim()) {
      return Response.json(
        { error: 'Vehicle model is required (e.g. Corolla Quest).', field: 'vehicleModel' },
        { status: 400 }
      );
    }

    if (!licensePlate || typeof licensePlate !== 'string' || !licensePlate.trim()) {
      return Response.json(
        { error: 'Vehicle license plate is required.', field: 'licensePlate' },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    const cleanPlate = licensePlate.trim().toUpperCase();
    const cleanPrdp = prdpNumber ? prdpNumber.trim().toUpperCase() : '';
    const cleanName = fullName.trim();
    const cleanMake = vehicleMake.trim();
    const cleanModel = vehicleModel.trim();

    // 3. Duplicate checks against Supabase persistent database first
    let dbCheckedSuccessfully = false;
    try {
      const dbCheckPromise = supabase
        .from('driver_profiles')
        .select('id, email, phone, license_plate, prdp_number');

      const result = await Promise.race([
        dbCheckPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
      ]);

      if (result && !result.error && Array.isArray(result.data)) {
        dbCheckedSuccessfully = true;
        reconcileMemoryDriversWithDatabase(result.data);

        if (result.data.length > 0) {
          const dbDuplicate = checkDriverDuplicatesInMemory(
            {
              email: cleanEmail,
              phone: cleanPhone,
              licensePlate: cleanPlate,
              prdpNumber: cleanPrdp,
            },
            result.data
          );

          if (dbDuplicate.isDuplicate) {
            return Response.json(
              {
                success: false,
                error: dbDuplicate.message,
                field: dbDuplicate.field,
                code: 'DUPLICATE_REGISTRATION',
              },
              { status: 409 }
            );
          }
        }
      }
    } catch (dbCheckErr) {
      console.warn('[AdminRegisterDriverAPI] Database duplicate check notice:', dbCheckErr);
    }

    // Fallback to in-memory check if DB was not reachable
    if (!dbCheckedSuccessfully) {
      const memDuplicate = checkDuplicateKycDriver({
        email: cleanEmail,
        phone: cleanPhone,
        licensePlate: cleanPlate,
        prdpNumber: cleanPrdp,
      });

      if (memDuplicate.isDuplicate) {
        return Response.json(
          {
            success: false,
            error: memDuplicate.message,
            field: memDuplicate.field,
            code: 'DUPLICATE_REGISTRATION',
          },
          { status: 409 }
        );
      }
    }

    // 4. Resolve Password
    const finalPassword =
      customPassword && typeof customPassword === 'string' && customPassword.trim().length >= 6
        ? customPassword.trim()
        : generateSecureDriverPassword();

    let driverId = crypto.randomUUID();
    let authUserCreated = false;

    // 5. Attempt to create user in Supabase Auth
    if (hasServiceRoleKey) {
      try {
        const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
          email: cleanEmail,
          password: finalPassword,
          email_confirm: true,
          user_metadata: {
            full_name: cleanName,
            phone: cleanPhone,
            role: 'driver',
            registered_by_manager: auth.session?.email || 'manager',
          },
        });

        if (!authErr && authUser?.user?.id) {
          driverId = authUser.user.id;
          authUserCreated = true;
        } else if (authErr) {
          console.warn('[AdminRegisterDriverAPI] Supabase admin.createUser notice:', authErr.message);
        }
      } catch (authCreateErr) {
        console.warn('[AdminRegisterDriverAPI] Supabase auth exception notice:', authCreateErr);
      }
    }

    // 5b. Fallback: If SUPABASE_SERVICE_ROLE_KEY is not configured, create the user in Supabase Auth via signUp()
    if (!authUserCreated && !supabaseUrl.includes('mock.supabase.co')) {
      try {
        const requestOrigin =
          req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'https://soloride.co.za';
        const signUpPromise = supabase.auth.signUp({
          email: cleanEmail,
          password: finalPassword,
          options: {
            emailRedirectTo: `${requestOrigin}/auth/callback?next=/driver`,
            data: {
              full_name: cleanName,
              phone: cleanPhone,
              user_type: 'driver',
              role: 'driver',
              registered_by_manager: auth.session?.email || 'manager',
            },
          },
        });

        const signUpRes = await Promise.race([
          signUpPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
        ]);

        if (signUpRes && !signUpRes.error && signUpRes.data?.user?.id) {
          driverId = signUpRes.data.user.id;
          authUserCreated = true;
        } else if (signUpRes?.error) {
          console.warn('[AdminRegisterDriverAPI] Supabase signUp notice:', signUpRes.error.message);
        }
      } catch (signUpErr) {
        console.warn('[AdminRegisterDriverAPI] Supabase signUp exception:', signUpErr);
      }
    }

    const isOwner = isPlatformOwner(cleanEmail);
    const verifiedStatus = isOwner ? true : Boolean(isVerified);
    const effectivePlan = isOwner ? 'owner' : (subscriptionPlan || 'trial');
    const trialStartIso = trialStartedAt ? new Date(trialStartedAt).toISOString() : new Date().toISOString();

    // 6. Save into resilient in-memory server kycStore
    const savedDriver = saveKycDriverProfile({
      id: driverId,
      fullName: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      vehicleMake: cleanMake,
      vehicleModel: cleanModel,
      licensePlate: cleanPlate,
      prdpNumber: cleanPrdp,
      isVerified: verifiedStatus,
      subscriptionPlan: effectivePlan,
      trialStartedAt: trialStartIso,
      createdAt: new Date().toISOString(),
      verificationNotes: `Registered via Manager Console by ${auth.session?.name || auth.session?.email || 'Operations Manager'}`,
    });

    // 7. Record update alert for Manager Dashboard
    const signupAlert = recordDriverSignupAlert({
      driverId,
      fullName: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      vehicleMake: cleanMake,
      vehicleModel: cleanModel,
      licensePlate: cleanPlate,
      prdpNumber: cleanPrdp,
    });

    // 8. Broadcast Realtime notification to active Manager consoles
    try {
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('mock.supabase.co')) {
        const channel = supabase.channel('solo-admin-alerts');
        channel
          .send({
            type: 'broadcast',
            event: 'NEW_DRIVER_SIGNUP',
            payload: signupAlert,
          })
          .catch(() => {});
      }
    } catch (realtimeErr) {
      console.warn('[AdminRegisterDriverAPI] Supabase broadcast notice:', realtimeErr);
    }

    // 9. Save / Upsert into Supabase driver_profiles table
    try {
      const dbPayload = {
        id: driverId,
        full_name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        vehicle_make: cleanMake,
        vehicle_model: cleanModel,
        license_plate: cleanPlate,
        prdp_number: cleanPrdp,
        has_license: hasLicense ?? true,
        has_prdp: hasPrdp ?? true,
        has_roadworthy: hasRoadworthy ?? true,
        is_verified: verifiedStatus,
        subscription_active: true,
        subscription_plan: effectivePlan,
        trial_started_at: trialStartIso,
        updated_at: new Date().toISOString(),
      };

      const upsertPromise = supabase
        .from('driver_profiles')
        .upsert(dbPayload, { onConflict: 'id' });

      await Promise.race([
        upsertPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
      ]);
    } catch (dbSaveErr) {
      console.warn('[AdminRegisterDriverAPI] Supabase driver_profiles error:', dbSaveErr);
    }

    return Response.json({
      success: true,
      driver: {
        id: driverId,
        fullName: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        vehicleMake: cleanMake,
        vehicleModel: cleanModel,
        vehicleYear: vehicleYear || null,
        vehicleColor: vehicleColor || null,
        licensePlate: cleanPlate,
        prdpNumber: cleanPrdp,
        isVerified: verifiedStatus,
        subscriptionPlan: effectivePlan,
        createdAt: savedDriver.createdAt,
      },
      temporaryPassword: finalPassword,
      authUserCreated,
      message: `Driver "${cleanName}" successfully registered and authorized by manager.`,
    });
  } catch (err: unknown) {
    console.error('[AdminRegisterDriverAPI] Unexpected error:', err);
    return Response.json(
      { error: (err as Error).message || 'Failed to register driver via manager console' },
      { status: 500 }
    );
  }
}
