import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminRequest } from '@/utils/adminAuth';
import { isPlatformOwner } from '@/utils/owner';
import { getKycDriverProfile } from '@/utils/kycStore';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';
const rawServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SECRET_KEY;

// Check whether the key is a genuine service_role secret key (JWT with role: "service_role" or sb_secret_*)
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

export async function POST(req: NextRequest) {
  try {
    // 1. Authorize manager request
    const auth = await validateAdminRequest(req);
    if (!auth.authorized) {
      return NextResponse.json(
        { error: 'Unauthorized: Manager credentials required', reason: auth.reason },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { driverId, email, newPassword, sendEmailLink } = body;

    if (!driverId && !email) {
      return NextResponse.json(
        { error: 'Missing driver identification: driverId or email is required.' },
        { status: 400 }
      );
    }

    if (newPassword && typeof newPassword === 'string' && newPassword.length < 6) {
      return NextResponse.json(
        { error: 'New password must be at least 6 characters long.' },
        { status: 400 }
      );
    }

    // 2. Resolve Driver profile & email from database / memory
    let resolvedEmail = (email || '').trim().toLowerCase();
    let resolvedName = '';
    let resolvedPhone = '';

    // Check driver_profiles table
    try {
      let query = supabase.from('driver_profiles').select('*');
      if (driverId) {
        query = query.eq('id', driverId);
      } else if (resolvedEmail) {
        query = query.eq('email', resolvedEmail);
      }
      const { data: dbDriver } = await query.maybeSingle();
      if (dbDriver) {
        resolvedEmail = (dbDriver.email || resolvedEmail).toLowerCase().trim();
        resolvedName = dbDriver.full_name || '';
        resolvedPhone = dbDriver.phone || '';
      }
    } catch (e) {
      console.warn('[ResetPasswordAPI] Notice looking up driver_profiles:', e);
    }

    // If still missing, check in-memory kyc store
    if (!resolvedEmail && driverId) {
      const memDriver = getKycDriverProfile(driverId);
      if (memDriver) {
        resolvedEmail = (memDriver.email || '').toLowerCase().trim();
        resolvedName = memDriver.fullName || '';
        resolvedPhone = memDriver.phone || '';
      }
    }

    // 3. Platform founder clearance check
    if (isPlatformOwner(resolvedEmail)) {
      if (!auth.session?.isOwner) {
        return NextResponse.json(
          { error: 'Forbidden: Platform Founder credentials can only be reset with Owner Master Clearance.' },
          { status: 403 }
        );
      }
    }

    const requestOrigin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'https://solo.soloride.co.za';
    const redirectUrl = `${requestOrigin}/auth/callback?next=/driver/reset-password`;

    let passwordDirectlyUpdated = false;
    let recoveryLink: string | null = null;
    let emailSent = false;
    let operationNotes: string[] = [];
    let authUserId: string | null = null;

    // 4. If direct password update is requested but server lacks SUPABASE_SERVICE_ROLE_KEY
    if (newPassword && !hasServiceRoleKey) {
      // Supabase Auth strictly forbids updating or creating users without service_role secret key
      console.warn('[ResetPasswordAPI] Direct password update attempted without SUPABASE_SERVICE_ROLE_KEY.');

      // Automatically dispatch password recovery email using public Supabase Auth client
      let emailDispatched = false;
      let emailDispatchError = '';
      if (resolvedEmail) {
        try {
          const { error: resetErr } = await supabase.auth.resetPasswordForEmail(resolvedEmail, {
            redirectTo: redirectUrl,
          });
          if (!resetErr) {
            emailDispatched = true;
            emailSent = true;
            operationNotes.push('Dispatched password recovery email to driver.');
          } else {
            emailDispatchError = resetErr.message;
          }
        } catch (emailEx) {
          emailDispatchError = (emailEx as Error).message;
        }
      }

      return NextResponse.json(
        {
          success: false,
          requiresServiceRoleKey: true,
          passwordUpdated: false,
          emailSent: emailDispatched,
          driverId,
          email: resolvedEmail,
          fullName: resolvedName,
          error: `SUPABASE_SERVICE_ROLE_KEY is not configured in server environment. Direct password override in Supabase Auth requires the Service Role Key. ${
            emailDispatched
              ? `A secure password reset link was automatically dispatched to ${resolvedEmail}. The driver can click the link in their email to set their password.`
              : emailDispatchError
              ? `Failed to dispatch reset email: ${emailDispatchError}`
              : 'Please configure SUPABASE_SERVICE_ROLE_KEY in your .env.local or production variables.'
          }`,
          notes: operationNotes,
        },
        { status: 422 }
      );
    }

    // 5. Locate Supabase Auth user (auth.users) if service role key is present
    if (hasServiceRoleKey) {
      // 5.1 Search by driverId (if it's a valid UUID)
      if (driverId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(driverId)) {
        try {
          const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(driverId);
          if (userData?.user && !userErr) {
            authUserId = userData.user.id;
            if (!resolvedEmail && userData.user.email) {
              resolvedEmail = userData.user.email.toLowerCase().trim();
            }
          }
        } catch (e) {
          console.warn('[ResetPasswordAPI] Direct user ID lookup note:', e);
        }
      }

      // 5.2 If ID lookup did not find the user, search by email across paginated auth.users
      if (!authUserId && resolvedEmail) {
        try {
          let page = 1;
          const perPage = 100;
          while (page <= 10) {
            const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({
              page,
              perPage,
            });
            if (listErr || !listData?.users || listData.users.length === 0) {
              break;
            }
            const matched = listData.users.find(
              (u) => u.email?.trim().toLowerCase() === resolvedEmail
            );
            if (matched) {
              authUserId = matched.id;
              break;
            }
            if (listData.users.length < perPage) {
              break;
            }
            page++;
          }
        } catch (e) {
          console.warn('[ResetPasswordAPI] Auth list lookup note:', e);
        }
      }

      // 5.3 Update password directly if provided and user exists
      if (newPassword && typeof newPassword === 'string') {
        if (authUserId) {
          // User exists: update password AND confirm email (resolves unconfirmed email blocking login)
          const { error: updateErr } = await supabase.auth.admin.updateUserById(authUserId, {
            password: newPassword,
            email_confirm: true,
          });

          if (updateErr) {
            console.error('[ResetPasswordAPI] Error updating auth password:', updateErr);
            return NextResponse.json(
              { error: `Supabase Auth update error: ${updateErr.message}` },
              { status: 500 }
            );
          }
          passwordDirectlyUpdated = true;
          operationNotes.push('Password updated and email confirmed in Supabase Auth.');
        } else if (resolvedEmail) {
          // User exists in driver_profiles/KYC but was never created in auth.users
          // Provision their auth user now with confirmed email
          try {
            const { data: createData, error: createErr } = await supabase.auth.admin.createUser({
              email: resolvedEmail,
              password: newPassword,
              email_confirm: true,
              user_metadata: {
                full_name: resolvedName,
                phone: resolvedPhone,
                user_type: 'driver',
              },
            });

            if (createErr) {
              console.error('[ResetPasswordAPI] Error provisioning auth user:', createErr);
              return NextResponse.json(
                { error: `Failed to provision driver login account: ${createErr.message}` },
                { status: 500 }
              );
            }

            if (createData?.user) {
              authUserId = createData.user.id;
              passwordDirectlyUpdated = true;
              operationNotes.push('Driver account provisioned in Supabase Auth with confirmed email.');

              // Synchronize driver_profiles record with authUserId
              try {
                await supabase.from('driver_profiles').upsert({
                  id: authUserId,
                  email: resolvedEmail,
                  full_name: resolvedName,
                  phone: resolvedPhone,
                  updated_at: new Date().toISOString(),
                });
              } catch (linkEx) {
                console.warn('[ResetPasswordAPI] Notice linking driver_profiles:', linkEx);
              }
            }
          } catch (createEx) {
            console.error('[ResetPasswordAPI] Exception creating auth user:', createEx);
            return NextResponse.json(
              { error: `Failed to create auth account: ${(createEx as Error).message}` },
              { status: 500 }
            );
          }
        }
      }
    }

    // 6. Generate recovery link or trigger reset email if requested
    if (sendEmailLink && resolvedEmail) {
      if (hasServiceRoleKey) {
        try {
          const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
            type: 'recovery',
            email: resolvedEmail,
            options: {
              redirectTo: redirectUrl,
            },
          });

          if (!linkErr && linkData?.properties?.action_link) {
            recoveryLink = linkData.properties.action_link;
            operationNotes.push('Secure recovery link generated.');
          }
        } catch (linkEx) {
          console.warn('[ResetPasswordAPI] generateLink notice:', linkEx);
        }
      }

      // Also trigger email dispatch via resetPasswordForEmail
      try {
        const { error: resetErr } = await supabase.auth.resetPasswordForEmail(resolvedEmail, {
          redirectTo: redirectUrl,
        });
        if (!resetErr) {
          emailSent = true;
          operationNotes.push('Password reset email dispatched to driver inbox.');
        } else {
          operationNotes.push(`Email dispatch note: ${resetErr.message}`);
        }
      } catch (emailEx) {
        console.warn('[ResetPasswordAPI] resetPasswordForEmail notice:', emailEx);
      }
    }

    // 7. Broadcast audit notification to manager consoles
    try {
      const channel = supabase.channel('solo-admin-alerts');
      channel.send({
        type: 'broadcast',
        event: 'DRIVER_PASSWORD_RESET',
        payload: {
          driverId: authUserId || driverId,
          driverName: resolvedName || 'Driver',
          email: resolvedEmail,
          managerEmail: auth.session?.email || 'Operations Manager',
          timestamp: new Date().toISOString(),
          passwordReset: passwordDirectlyUpdated,
          emailSent,
        },
      }).catch(() => {});
    } catch (e) {
      console.warn('[ResetPasswordAPI] Broadcast notice:', e);
    }

    return NextResponse.json({
      success: true,
      message: `Password successfully updated for ${resolvedName || resolvedEmail || 'driver'}.`,
      driverId: authUserId || driverId,
      email: resolvedEmail,
      fullName: resolvedName,
      phone: resolvedPhone,
      passwordUpdated: passwordDirectlyUpdated,
      emailSent,
      recoveryLink,
      notes: operationNotes,
    });
  } catch (err: unknown) {
    console.error('[ResetPasswordAPI] Unexpected error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to reset driver password' },
      { status: 500 }
    );
  }
}
