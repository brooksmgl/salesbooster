import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabaseServer';
import { withCORS, options } from '@/lib/cors';
import { attachSessionCookie, clearSessionCookie } from '@/lib/session';

export { options as OPTIONS };

export async function POST(req: NextRequest) {
  const { email }: { email?: string } = await req.json().catch(() => ({}));
  const normalized = email?.trim().toLowerCase();
  if (!normalized || typeof normalized !== 'string' || !normalized.includes('@')) {
    return withCORS(NextResponse.json({ error: 'Valid email required' }, { status: 400 }));
  }

  const sb = getServiceClient();
  const { data, error } = await sb
    .from('users')
    .select('id, email, is_active')
    .ilike('email', normalized)
    .single();

  if (error || !data) {
    return withCORS(NextResponse.json({ error: 'Email not found' }, { status: 401 }));
  }

  if (!data.is_active) {
    return withCORS(NextResponse.json({ error: 'Your account access has been deactivated. Please contact support.' }, { status: 403 }));
  }

  const res = withCORS(NextResponse.json({ user: { id: data.id, email: data.email ?? null } }));
  attachSessionCookie(res, { id: data.id, email: data.email ?? null });
  return res;
}

export async function DELETE() {
  const res = withCORS(NextResponse.json({ ok: true }));
  clearSessionCookie(res);
  return res;
}
