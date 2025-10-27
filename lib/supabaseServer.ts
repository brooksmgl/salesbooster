import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const srv = process.env.SUPABASE_SERVICE_ROLE!;

export function getServiceClient() {
  return createClient(url, srv);
}
