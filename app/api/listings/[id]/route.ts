import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabaseServer';
import { withCORS, options } from '@/lib/cors';
import { getSessionUser } from '@/lib/session';

export { options as OPTIONS };

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser(req);
  if (!user) {
    return withCORS(NextResponse.json({ error: 'Not signed in' }, { status: 401 }));
  }
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('listings')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (error) return withCORS(NextResponse.json({ error: error.message }, { status: 404 }));
  return withCORS(NextResponse.json({ listing: data }));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser(req);
  if (!user) {
    return withCORS(NextResponse.json({ error: 'Not signed in' }, { status: 401 }));
  }
  const sb = getServiceClient();
  const { error } = await sb.from('listings').delete().eq('id', id).eq('user_id', user.id);
  if (error) {
    return withCORS(NextResponse.json({ error: error.message }, { status: 400 }));
  }
  return withCORS(NextResponse.json({ ok: true }));
}
