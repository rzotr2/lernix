import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase-admin';
import { touchRecentPage, updateLastActivity } from '@/utils/dashboard-stats';

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

async function isOwner(pageId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from('pages')
    .select('id, owner_id')
    .eq('id', pageId)
    .maybeSingle();

  return data?.owner_id === userId;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getAuthedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const canAccess = await isOwner(id, user.id);
  if (!canAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date().toISOString();
  console.log('[dashboard] page access', { userId: user.id, pageId: id });
  await touchRecentPage({ userId: user.id, pageId: id, accessedAt: now });
  await updateLastActivity({ userId: user.id, lastActivityAt: now });

  return NextResponse.json({ success: true });
}
