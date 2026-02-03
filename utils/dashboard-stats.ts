import { supabaseAdmin } from '@/utils/supabase-admin';

type UserStatsRow = {
  user_id: string;
  total_pages_count: number;
  pages_with_ai_count: number;
  total_ai_calls: number;
  last_activity_at: string | null;
};

type DailyActivityRow = {
  user_id: string;
  activity_date: string;
  pages_created_count: number;
  ai_calls_count: number;
};

const EMPTY_STATS: UserStatsRow = {
  user_id: '',
  total_pages_count: 0,
  pages_with_ai_count: 0,
  total_ai_calls: 0,
  last_activity_at: null
};

function toDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function incrementUserStats({
  userId,
  pagesDelta = 0,
  pagesWithAiDelta = 0,
  aiCallsDelta = 0,
  lastActivityAt
}: {
  userId: string;
  pagesDelta?: number;
  pagesWithAiDelta?: number;
  aiCallsDelta?: number;
  lastActivityAt?: string;
}) {
  const { data, error: selectError } = await supabaseAdmin
    .from('user_stats')
    .select('user_id,total_pages_count,pages_with_ai_count,total_ai_calls,last_activity_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (selectError) {
    console.log('[dashboard] user_stats select failed', { userId, error: selectError.message });
  }

  const current: UserStatsRow = data || { ...EMPTY_STATS, user_id: userId };
  const next: UserStatsRow = {
    user_id: userId,
    total_pages_count: Math.max(0, (current.total_pages_count || 0) + pagesDelta),
    pages_with_ai_count: Math.max(0, (current.pages_with_ai_count || 0) + pagesWithAiDelta),
    total_ai_calls: Math.max(0, (current.total_ai_calls || 0) + aiCallsDelta),
    last_activity_at: lastActivityAt || current.last_activity_at || new Date().toISOString()
  };

  const { error: upsertError } = await supabaseAdmin
    .from('user_stats')
    .upsert(next, { onConflict: 'user_id' });
  if (upsertError) {
    console.log('[dashboard] user_stats upsert failed', { userId, error: upsertError.message });
  }
}

export async function incrementDailyActivity({
  userId,
  pagesCreatedDelta = 0,
  aiCallsDelta = 0,
  date = new Date()
}: {
  userId: string;
  pagesCreatedDelta?: number;
  aiCallsDelta?: number;
  date?: Date;
}) {
  const dateKey = toDateKey(date);
  const { data, error: selectError } = await supabaseAdmin
    .from('user_activity_daily')
    .select('user_id,activity_date,pages_created_count,ai_calls_count')
    .eq('user_id', userId)
    .eq('activity_date', dateKey)
    .maybeSingle();
  if (selectError) {
    console.log('[dashboard] user_activity_daily select failed', { userId, dateKey, error: selectError.message });
  }

  const current: DailyActivityRow = data || {
    user_id: userId,
    activity_date: dateKey,
    pages_created_count: 0,
    ai_calls_count: 0
  };

  const next: DailyActivityRow = {
    user_id: userId,
    activity_date: dateKey,
    pages_created_count: Math.max(0, (current.pages_created_count || 0) + pagesCreatedDelta),
    ai_calls_count: Math.max(0, (current.ai_calls_count || 0) + aiCallsDelta)
  };

  const { error: upsertError } = await supabaseAdmin
    .from('user_activity_daily')
    .upsert(next, { onConflict: 'user_id,activity_date' });
  if (upsertError) {
    console.log('[dashboard] user_activity_daily upsert failed', { userId, dateKey, error: upsertError.message });
  }
}

export async function touchRecentPage({
  userId,
  pageId,
  accessedAt = new Date().toISOString()
}: {
  userId: string;
  pageId: string;
  accessedAt?: string;
}) {
  const { error } = await supabaseAdmin
    .from('user_recent_pages')
    .upsert(
      {
        user_id: userId,
        page_id: pageId,
        last_accessed_at: accessedAt
      },
      { onConflict: 'user_id,page_id' }
    );
  if (error) {
    console.log('[dashboard] user_recent_pages upsert failed', { userId, pageId, error: error.message });
  }
}

export async function markPageAiUsage({
  userId,
  pageId,
  firstAiAt = new Date().toISOString()
}: {
  userId: string;
  pageId: string;
  firstAiAt?: string;
}) {
  const { data, error: selectError } = await supabaseAdmin
    .from('user_page_ai_usage')
    .select('page_id')
    .eq('user_id', userId)
    .eq('page_id', pageId)
    .maybeSingle();
  if (selectError) {
    console.log('[dashboard] user_page_ai_usage select failed', { userId, pageId, error: selectError.message });
  }

  if (data) return false;

  const { error: insertError } = await supabaseAdmin.from('user_page_ai_usage').insert({
    user_id: userId,
    page_id: pageId,
    first_ai_at: firstAiAt
  });
  if (insertError) {
    console.log('[dashboard] user_page_ai_usage insert failed', { userId, pageId, error: insertError.message });
  }

  return true;
}

export async function updateLastActivity({
  userId,
  lastActivityAt = new Date().toISOString()
}: {
  userId: string;
  lastActivityAt?: string;
}) {
  await incrementUserStats({ userId, lastActivityAt });
}
