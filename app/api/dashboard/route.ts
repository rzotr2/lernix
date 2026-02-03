import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase-admin';

export const dynamic = 'force-dynamic';

async function getAuthedUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return { user: null };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return { user: null };
  }

  return { user: data.user };
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const { user } = await getAuthedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[dashboard] fetch start', { userId: user.id });

  const { data: stats } = await supabaseAdmin
    .from('user_stats')
    .select('total_pages_count,pages_with_ai_count,total_ai_calls,last_activity_at')
    .eq('user_id', user.id)
    .maybeSingle();

  const statsSafe = {
    total_pages_count: stats?.total_pages_count || 0,
    pages_with_ai_count: stats?.pages_with_ai_count || 0,
    total_ai_calls: stats?.total_ai_calls || 0,
    last_activity_at: stats?.last_activity_at || null
  };

  const { data: subscriptionStatus } = await supabaseAdmin
    .from('user_subscription_status')
    .select('trial_status,subscription_status,updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  const { data: trialRow } = await supabaseAdmin
    .from('user_trials')
    .select('trial_start_time,trial_end_time,is_trial_used')
    .eq('user_id', user.id)
    .maybeSingle();

  const now = new Date();
  const trialEnd = trialRow?.trial_end_time ? new Date(trialRow.trial_end_time) : null;
  const trialActive = trialEnd ? now < trialEnd : false;

  const today = new Date();
  const start30 = new Date(today);
  start30.setDate(today.getDate() - 29);
  const startKey = dateKey(start30);

  const { data: activityRows } = await supabaseAdmin
    .from('user_activity_daily')
    .select('activity_date,pages_created_count,ai_calls_count')
    .eq('user_id', user.id)
    .gte('activity_date', startKey)
    .order('activity_date', { ascending: true });

  const activityMap = new Map<string, { pages: number; ai: number }>();
  (activityRows || []).forEach((row) => {
    activityMap.set(row.activity_date, {
      pages: row.pages_created_count || 0,
      ai: row.ai_calls_count || 0
    });
  });

  const activity30Days = Array.from({ length: 30 }).map((_, index) => {
    const date = new Date(start30);
    date.setDate(start30.getDate() + index);
    const key = dateKey(date);
    const row = activityMap.get(key) || { pages: 0, ai: 0 };
    return {
      date: key,
      pagesCreated: row.pages,
      aiCalls: row.ai
    };
  });

  const activity7Days = activity30Days.slice(-7);

  const { data: recentRows } = await supabaseAdmin
    .from('user_recent_pages')
    .select('page_id,last_accessed_at,pages(id,title,slug,updated_at)')
    .eq('user_id', user.id)
    .order('last_accessed_at', { ascending: false })
    .limit(5);

  const recentPages = (recentRows || [])
    .map((row: any) => ({
      id: row.pages?.id || row.page_id,
      title: row.pages?.title || 'Untitled',
      slug: row.pages?.slug || '',
      updated_at: row.pages?.updated_at || row.last_accessed_at,
      last_accessed_at: row.last_accessed_at
    }))
    .filter((page) => page.id);

  if (recentPages.length === 0 && statsSafe.total_pages_count > 0) {
    const { data: fallbackPages } = await supabaseAdmin
      .from('pages')
      .select('id,title,slug,updated_at')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(5);
    const nowIso = now.toISOString();
    const fallback = (fallbackPages || []).map((page) => ({
      id: page.id,
      title: page.title || 'Untitled',
      slug: page.slug || '',
      updated_at: page.updated_at || nowIso,
      last_accessed_at: page.updated_at || nowIso
    }));
    if (fallback.length > 0) {
      await supabaseAdmin.from('user_recent_pages').upsert(
        fallback.map((page) => ({
          user_id: user.id,
          page_id: page.id,
          last_accessed_at: page.updated_at
        })),
        { onConflict: 'user_id,page_id' }
      );
    }
    recentPages.splice(0, recentPages.length, ...fallback);
  }

  console.log('[dashboard] fetch result', {
    userId: user.id,
    totals: statsSafe,
    recentCount: recentPages.length,
    activityCount: activity30Days.length
  });

  const aiUsagePercent =
    statsSafe.total_pages_count > 0
      ? Math.round((statsSafe.pages_with_ai_count / statsSafe.total_pages_count) * 100)
      : 0;

  return NextResponse.json({
    stats: statsSafe,
    aiUsagePercent,
    recentPages,
    lastPage: recentPages[0] || null,
    activity30Days,
    activity7Days,
    subscriptionStatus: subscriptionStatus || null,
    trialStatus: {
      active: trialActive,
      end_time: trialRow?.trial_end_time || null,
      is_trial_used: trialRow?.is_trial_used || false
    }
  });
}
