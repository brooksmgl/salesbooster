import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabaseServer';
import { withCORS, options } from '@/lib/cors';
import { getSessionUser } from '@/lib/session';

export { options as OPTIONS };

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser(req);
  if (!user) {
    return withCORS(NextResponse.json({ error: 'Not signed in' }, { status: 401 }));
  }

  const { path }: { path?: string } = await req.json().catch(() => ({}));
  if (!path) return withCORS(NextResponse.json({ error: 'Missing path' }, { status: 400 }));

  const sb = getServiceClient();

  const { error: lookupError } = await sb
    .from('listings')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();
  if (lookupError) {
    return withCORS(NextResponse.json({ error: lookupError.message }, { status: 404 }));
  }

  const { data, error } = await sb.storage.from('listing-images').createSignedUrl(path, 600);
  if (error || !data?.signedUrl) {
    return withCORS(NextResponse.json({ error: error?.message || 'Unable to sign image' }, { status: 400 }));
  }

  return withCORS(NextResponse.json({ signedUrl: data.signedUrl }));
}
