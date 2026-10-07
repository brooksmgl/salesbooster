import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getServiceClient } from '@/lib/supabaseServer';

// GHL calls this server-to-server to grant or revoke access.
// "remove" deactivates instead of deleting, so a returning member keeps their listings.

function authorized(req: NextRequest) {
  const expected = process.env.SB_ADMIN_TOKEN;
  if (!expected) return false;
  const header = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const given = header || req.nextUrl.searchParams.get('token') || '';
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ilike treats _ and % as wildcards; escape them so "a_b@x.com" can't match "axb@x.com".
function exactIlike(email: string) {
  return email.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const email = String(body.email ?? '').trim().toLowerCase();
  const action = String(body.action ?? req.nextUrl.searchParams.get('action') ?? '').trim().toLowerCase();

  if (!email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }
  if (action !== 'add' && action !== 'remove') {
    return NextResponse.json({ error: 'action must be "add" or "remove"' }, { status: 400 });
  }

  const sb = getServiceClient();
  const { data: matches, error: findError } = await sb
    .from('users')
    .select('id, email, is_active')
    .ilike('email', exactIlike(email));

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }

  const isActive = action === 'add';

  if (!matches || matches.length === 0) {
    if (action === 'remove') {
      return NextResponse.json({ ok: true, email, result: 'not_found' });
    }
    const { error: insertError } = await sb.from('users').insert({ email, is_active: true });
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, email, result: 'created' });
  }

  const { error: updateError } = await sb
    .from('users')
    .update({ is_active: isActive })
    .in('id', matches.map((m) => m.id));

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, email, result: isActive ? 'activated' : 'deactivated' });
}
