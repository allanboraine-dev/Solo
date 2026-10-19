import { isPlatformOwner } from './owner.ts';

export interface AdminSession {
  email: string;
  name: string;
  role: 'super_admin' | 'compliance_manager' | 'operations_officer';
  loginTime: string;
  isOwner?: boolean;
}

const ADMIN_SESSION_KEY = 'solo_admin_session';

// Strictly authorized executive and owner passcodes
const AUTHORIZED_PASSCODES = [
  '13579', // Platform Owner / Founder Master Passcode
  ...(process.env.ADMIN_MASTER_KEY ? [process.env.ADMIN_MASTER_KEY.trim()] : []),
];



export function getAdminSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY) || sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (session && session.email && session.role) {
      return session;
    }
  } catch (e) {
    console.warn('Error reading admin session:', e);
  }
  return null;
}

export function setAdminSession(session: AdminSession, persist: boolean = true): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = JSON.stringify(session);
    if (persist) {
      localStorage.setItem(ADMIN_SESSION_KEY, raw);
    } else {
      sessionStorage.setItem(ADMIN_SESSION_KEY, raw);
    }
    // Set cookie for Next.js server middleware and API route guards
    const maxAge = persist ? 60 * 60 * 24 * 7 : 60 * 60 * 8; // 7 days or 8 hours
    document.cookie = `${ADMIN_SESSION_KEY}=${encodeURIComponent(raw)}; path=/; max-age=${maxAge}; SameSite=Lax; ${window.location.protocol === 'https:' ? 'Secure;' : ''}`;
  } catch (e) {
    console.warn('Error saving admin session:', e);
  }
}

export function clearAdminSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ADMIN_SESSION_KEY);
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  document.cookie = `${ADMIN_SESSION_KEY}=; path=/; max-age=0; SameSite=Lax`;
}

export function validateAdminRequest(req: Request | { headers: Headers | { get: (name: string) => string | null } }): { authorized: boolean; reason?: string; session?: AdminSession } {
  try {
    const headers = req.headers;
    const authHeader = headers.get('authorization') || '';
    const passkeyHeader = headers.get('x-admin-passcode') || headers.get('x-admin-token') || '';

    // 1. Direct header authorization (for programmatic API calls or integrations)
    if (passkeyHeader && verifyManagerPasscode(passkeyHeader)) {
      return {
        authorized: true,
        session: isOwnerPasscode(passkeyHeader)
          ? createOwnerAdminSession('allanboraine@gmail.com')
          : {
              email: 'operations@soloride.co.za',
              name: 'SOLO Operations Manager',
              role: 'compliance_manager',
              loginTime: new Date().toISOString(),
            },
      };
    }

    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      if (verifyManagerPasscode(token)) {
        return {
          authorized: true,
          session: isOwnerPasscode(token)
            ? createOwnerAdminSession('allanboraine@gmail.com')
            : {
                email: 'operations@soloride.co.za',
                name: 'SOLO Operations Manager',
                role: 'compliance_manager',
                loginTime: new Date().toISOString(),
              },
        };
      }
    }

    // 2. Cookie authorization (for browser page navigation & portal API fetches)
    const cookieHeader = headers.get('cookie') || '';
    if (cookieHeader) {
      const parts = cookieHeader.split(';');
      for (const part of parts) {
        const [k, ...v] = part.trim().split('=');
        if (k === ADMIN_SESSION_KEY) {
          const raw = decodeURIComponent(v.join('='));
          try {
            const session: AdminSession = JSON.parse(raw);
            if (
              session &&
              session.email &&
              (session.role === 'super_admin' || session.role === 'compliance_manager' || session.role === 'operations_officer')
            ) {
              if (session.isOwner && !isPlatformOwner(session.email)) {
                return { authorized: false, reason: 'Unauthorized owner impersonation' };
              }
              return { authorized: true, session };
            }
          } catch {
            return { authorized: false, reason: 'Invalid session payload' };
          }
        }
      }
    }

    return { authorized: false, reason: 'Missing or expired manager credentials' };
  } catch (err) {
    return { authorized: false, reason: 'Authorization validation failure' };
  }
}


export function verifyManagerPasscode(passcode: string): boolean {
  if (!passcode) return false;
  const clean = passcode.trim();
  return AUTHORIZED_PASSCODES.includes(clean);
}

export function isOwnerPasscode(passcode: string): boolean {
  if (!passcode) return false;
  const clean = passcode.trim();
  return clean === '13579';
}


export function createOwnerAdminSession(email: string = 'allanboraine@gmail.com'): AdminSession {
  return {
    email: email.toLowerCase(),
    name: isPlatformOwner(email) ? 'Allan Boraine (Founder)' : 'Compliance Manager',
    role: 'super_admin',
    loginTime: new Date().toISOString(),
    isOwner: isPlatformOwner(email),
  };
}
