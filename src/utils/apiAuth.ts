import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { validateAdminRequest } from './adminAuth.ts';
import { isPlatformOwner } from './owner.ts';
import type { RequestLike } from './rateLimit.ts';

export interface AuthContext {
  id: string;
  email?: string;
  isAdmin?: boolean;
  isOwner?: boolean;
}

export interface AuthValidationResult {
  authorized: boolean;
  reason?: string;
  user?: AuthContext;
}

/**
 * Extracts the authenticated user from either Bearer token or Supabase session cookies.
 */
export async function getAuthenticatedUser(req: RequestLike): Promise<AuthContext | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 1. Check Bearer token in Authorization header
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token && supabaseUrl && anonKey && !supabaseUrl.includes('mock')) {
      try {
        const client = createSupabaseClient(supabaseUrl, anonKey, {
          auth: { persistSession: false },
        });
        const { data, error } = await client.auth.getUser(token);
        if (!error && data?.user) {
          return {
            id: data.user.id,
            email: data.user.email,
            isOwner: isPlatformOwner(data.user.email),
          };
        }
      } catch (e) {
        console.warn('[API Auth] Error verifying Bearer token:', e);
      }
    }
  }

  // 2. Check Supabase cookies via SSR client
  if (supabaseUrl && anonKey && !supabaseUrl.includes('mock')) {
    try {
      const { createClient: createServerSupabaseClient } = await import('@/utils/supabase/server');
      const serverClient = createServerSupabaseClient();
      const { data, error } = await serverClient.auth.getUser();
      if (!error && data?.user) {
        return {
          id: data.user.id,
          email: data.user.email,
          isOwner: isPlatformOwner(data.user.email),
        };
      }
    } catch {
      // Cookies/Next headers may be unreadable in certain environments; ignore
    }
  }

  return null;
}

/**
 * Authorizes a request to access or mutate a specific driver's sensitive profile/data (BOLA protection).
 *
 * Grants access if:
 * 1. The caller is an authorized manager or platform owner (Admin session)
 * 2. The caller's authenticated user ID matches the target driver ID
 * 3. The caller is in an offline/mock environment without production Supabase keys configured
 */
export async function validateDriverAuthorization(
  req: RequestLike,
  targetDriverId: string
): Promise<AuthValidationResult> {
  // 1. Allow administrative and founder sessions (Verification Portal, operations review)
  const adminCheck = validateAdminRequest(req);
  if (adminCheck.authorized) {
    return {
      authorized: true,
      user: {
        id: targetDriverId,
        email: adminCheck.session?.email,
        isAdmin: true,
        isOwner: adminCheck.session?.isOwner,
      },
    };
  }

  // 2. Graceful offline/test fallback when Supabase is unconfigured or in mock mode
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isMockEnvironment =
    !supabaseUrl ||
    supabaseUrl.includes('mock.supabase.co') ||
    process.env.NODE_ENV === 'test';

  if (isMockEnvironment) {
    return {
      authorized: true,
      user: {
        id: targetDriverId,
        email: 'local_driver@soloride.co.za',
      },
    };
  }

  // 3. Authenticate standard driver session
  const authUser = await getAuthenticatedUser(req);
  if (!authUser) {
    return {
      authorized: false,
      reason: 'Authentication required. Please sign in to access driver account.',
    };
  }

  // 4. Broken Object Level Authorization (BOLA) Check:
  // Driver can only access their own profile (or founder exemption)
  if (authUser.id !== targetDriverId && !authUser.isOwner) {
    return {
      authorized: false,
      reason: 'Forbidden: You do not have permission to access or modify this driver profile.',
    };
  }

  return {
    authorized: true,
    user: authUser,
  };
}

/**
 * Helper to generate a standardized 401/403 forbidden response.
 */
export function createUnauthorizedResponse(reason: string = 'Access denied', status: number = 403): Response {
  return Response.json(
    {
      error: reason,
      code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
    },
    { status }
  );
}
