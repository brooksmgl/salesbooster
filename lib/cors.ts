import { NextResponse } from 'next/server';

const ALLOWED = process.env.ALLOWED_ORIGIN || '*';

export function withCORS(res: NextResponse) {
  res.headers.set('Access-Control-Allow-Origin', ALLOWED);
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Credentials', 'true');
  return res;
}

export function options() {
  return withCORS(new NextResponse(null, { status: 204 }));
}
