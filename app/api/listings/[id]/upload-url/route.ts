import { randomUUID } from 'crypto';
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
  const sb = getServiceClient();

  const { error: e0 } = await sb
    .from('listings')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();
  if (e0) return withCORS(NextResponse.json({ error: e0.message }, { status: 404 }));

  const filename = randomUUID();
  const ext = 'jpg'; // client can still send any; change as needed
  const path = `${user.id}/${params.id}/${filename}.${ext}`;

  // Signed upload URL
  const { data, error } = await sb.storage.from('listing-images').createSignedUploadUrl(path);
  if (error || !data) return withCORS(NextResponse.json({ error: error?.message || 'upload url err' }, { status: 400 }));

  // NOTE: data.signedUrl is the URL to PUT the file; public access remains private
  return withCORS(
    NextResponse.json({
      uploadUrl: data.signedUrl,
      token: data.token,
      path,
    })
  );
}
