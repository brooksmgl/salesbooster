import { NextRequest, NextResponse } from 'next/server';
import { withCORS, options } from '@/lib/cors';
import { getSessionUser } from '@/lib/session';

export { options as OPTIONS };

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return withCORS(NextResponse.json({ error: 'Not signed in' }, { status: 401 }));
  }
  return withCORS(NextResponse.json({ user }));
}
