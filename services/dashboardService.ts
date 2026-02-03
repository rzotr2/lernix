import { SupabaseClient } from '@supabase/supabase-js';

export async function getDashboardData(supabase: SupabaseClient) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;

  const response = await fetch('/api/dashboard', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });

  if (!response.ok) {
    console.error('[dashboard] client fetch failed', response.status);
    return null;
  }

  const payload = await response.json();
  console.log('[dashboard] client fetch ok', payload);
  return payload;
}
