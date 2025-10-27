import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabaseServer';
import { withCORS, options } from '@/lib/cors';
import { getSessionUser } from '@/lib/session';

export { options as OPTIONS };

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return withCORS(NextResponse.json({ error: 'Not signed in' }, { status: 401 }));
  }
  const sb = getServiceClient();

  const { data, error } = await sb
    .from('listings')
    .insert({ user_id: user.id })
    .select('*')
    .single();

  if (error) return withCORS(NextResponse.json({ error: error.message }, { status: 400 }));
  return withCORS(NextResponse.json({ listing: data }));
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return withCORS(NextResponse.json({ error: 'Not signed in' }, { status: 401 }));
  }
  const sb = getServiceClient();
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
  const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await sb
    .from('listings')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .range(from, to);

  if (error) return withCORS(NextResponse.json({ error: error.message }, { status: 400 }));
  return withCORS(NextResponse.json({ listings: data, total: count }));
}
