import { SupabaseClient } from '@supabase/supabase-js';

export async function getDashboardData(supabase: SupabaseClient) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 10000);

  let response: Response;
  try {
    response = await fetch('/api/dashboard', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    console.error('[dashboard] client fetch failed', response.status);
    return null;
  }

  const payload = await response.json();
  console.log('[dashboard] client fetch ok', payload);
  return payload;
}
