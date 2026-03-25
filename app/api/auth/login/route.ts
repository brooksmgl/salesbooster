import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabaseServer';
import { findUserByEmail } from '@/lib/airtable';
import { withCORS, options } from '@/lib/cors';
import { attachSessionCookie, clearSessionCookie } from '@/lib/session';

export { options as OPTIONS };

export async function POST(req: NextRequest) {
  const { email }: { email?: string } = await req.json().catch(() => ({}));
  const normalized = email?.trim().toLowerCase();
  if (!normalized || typeof normalized !== 'string' || !normalized.includes('@')) {
    return withCORS(NextResponse.json({ error: 'Valid email required' }, { status: 400 }));
  }

  // Try Supabase first
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('users')
    .select('id, email')
    .ilike('email', normalized)
    .single();

  if (!error && data) {
    const res = withCORS(NextResponse.json({ user: { id: data.id, email: data.email ?? null } }));
    attachSessionCookie(res, { id: data.id, email: data.email ?? null, source: 'supabase' });
    return res;
  }

  // Fallback to Airtable (members + staff tables)
  const atUser = await findUserByEmail(normalized);
  if (atUser) {
    const res = withCORS(NextResponse.json({ user: { id: atUser.id, email: atUser.email } }));
    attachSessionCookie(res, { id: atUser.id, email: atUser.email, source: 'airtable' });
    return res;
  }

  return withCORS(NextResponse.json({ error: 'Email not found' }, { status: 401 }));
}

export async function DELETE() {
  const res = withCORS(NextResponse.json({ ok: true }));
  clearSessionCookie(res);
  return res;
}
