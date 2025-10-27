import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from './supabaseServer';

const COOKIE_NAME = 'sb-user';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type SessionUser = {
  id: string;
  email: string | null;
};

function decodeCookie(raw: string) {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (typeof parsed?.id === 'string') {
      return parsed.id as string;
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  const stored = req.cookies.get(COOKIE_NAME)?.value;
  if (!stored) return null;

  const userId = decodeCookie(stored);
  if (!userId) return null;

  const sb = getServiceClient();
  const { data, error } = await sb.from('users').select('id, email').eq('id', userId).single();
  if (error || !data) return null;

  return { id: data.id, email: data.email ?? null };
}

export function attachSessionCookie(res: NextResponse, user: SessionUser) {
  const value = Buffer.from(JSON.stringify({ id: user.id })).toString('base64url');
  res.cookies.set({
    name: COOKIE_NAME,
    value,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set({
    name: COOKIE_NAME,
    value: '',
    path: '/',
    maxAge: 0,
  });
}
