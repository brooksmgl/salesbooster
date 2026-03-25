import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from './supabaseServer';
import { findUserById } from './airtable';

const COOKIE_NAME = 'sb-user';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type SessionUser = {
  id: string;
  email: string | null;
  source?: 'supabase' | 'airtable';
};

type CookiePayload = {
  id: string;
  source?: 'supabase' | 'airtable';
};

function decodeCookie(raw: string): CookiePayload | null {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (typeof parsed?.id === 'string') {
      return { id: parsed.id, source: parsed.source ?? 'supabase' };
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  const stored = req.cookies.get(COOKIE_NAME)?.value;
  if (!stored) return null;

  const payload = decodeCookie(stored);
  if (!payload) return null;

  if (payload.source === 'airtable') {
    const atUser = await findUserById(payload.id);
    if (!atUser) return null;
    return { id: atUser.id, email: atUser.email, source: 'airtable' };
  }

  // Default: Supabase
  const sb = getServiceClient();
  const { data, error } = await sb.from('users').select('id, email').eq('id', payload.id).single();
  if (error || !data) return null;

  return { id: data.id, email: data.email ?? null, source: 'supabase' };
}

export function attachSessionCookie(res: NextResponse, user: SessionUser) {
  const value = Buffer.from(JSON.stringify({ id: user.id, source: user.source ?? 'supabase' })).toString('base64url');
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
