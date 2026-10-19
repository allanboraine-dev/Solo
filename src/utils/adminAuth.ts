import { isPlatformOwner } from './owner.ts';

export interface AdminSession {
  email: string;
  name: string;
  role: 'super_admin' | 'compliance_manager' | 'operations_officer';
  loginTime: string;
  isOwner?: boolean;
}

const ADMIN_SESSION_KEY = 'solo_admin_session';

// Approved manager and owner passkeys for instant operations & owner access
const AUTHORIZED_PASSCODES = [
  '13579', // Owner / Founder Master Passcode
  '9021',
  'SOLO-ADMIN-2026',
  'SOLO-COMPLIANCE-KEY',
  'BORAINETECH',
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
  } catch (e) {
    console.warn('Error saving admin session:', e);
  }
}

export function clearAdminSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ADMIN_SESSION_KEY);
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
}

export function verifyManagerPasscode(passcode: string): boolean {
  if (!passcode) return false;
  const clean = passcode.trim();
  return AUTHORIZED_PASSCODES.includes(clean);
}

export function isOwnerPasscode(passcode: string): boolean {
  if (!passcode) return false;
  const clean = passcode.trim();
  return clean === '13579' || clean.toUpperCase() === 'BORAINETECH';
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
