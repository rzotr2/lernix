import { SupabaseClient } from '@supabase/supabase-js';

export type DashboardStats = {
  total_pages_count: number;
  pages_with_ai_count: number;
  total_ai_calls: number;
  last_activity_at: string | null;
};

export type DashboardActivity = {
  date: string;
  pagesCreated: number;
  aiCalls: number;
};

export type DashboardRecentPage = {
  id: string;
  title: string;
  slug: string;
  updated_at: string;
  last_accessed_at?: string;
};

export type DashboardTrialStatus = {
  active: boolean;
  end_time: string | null;
  is_trial_used: boolean;
};

export type DashboardSubscriptionStatus = {
  trial_status?: string | null;
  subscription_status?: string | null;
  updated_at?: string | null;
} | null;

export type DashboardData = {
  stats: DashboardStats;
  aiUsagePercent: number;
  recentPages: DashboardRecentPage[];
  favorites: DashboardRecentPage[];
  lastPage: DashboardRecentPage | null;
  activity30Days: DashboardActivity[];
  activity7Days: DashboardActivity[];
  subscriptionStatus: DashboardSubscriptionStatus;
  trialStatus: DashboardTrialStatus;
};

export async function getDashboardData(supabase: SupabaseClient): Promise<DashboardData | null> {
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
