import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase-admin';
import { touchRecentPage, updateLastActivity } from '@/utils/dashboard-stats';

type ReorderPayload = {
  page_id?: string;
  updates?: Array<{ logical_id: string; position: number }>;
};

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

export async function PATCH(request: NextRequest) {
  const { user } = await getAuthedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as ReorderPayload;
  const pageId = body.page_id;
  const updates = body.updates || [];

  if (!pageId || updates.length === 0) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const canAccess = await isOwner(pageId, user.id);
  if (!canAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: existingBlocks, error } = await supabaseAdmin
    .from('blocks')
    .select('id, logical_id, type, content, position, version')
    .eq('page_id', pageId)
    .order('version', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const latestMap = new Map<string, typeof existingBlocks[number]>();
  existingBlocks?.forEach((block) => {
    if (!latestMap.has(block.logical_id)) {
      latestMap.set(block.logical_id, block);
    }
  });

  const now = new Date().toISOString();
  const inserts = updates
    .map((update) => {
      const latest = latestMap.get(update.logical_id);
      if (!latest) return null;
      if (latest.position === update.position) return null;
      return {
        page_id: pageId,
        logical_id: latest.logical_id,
        type: latest.type,
        content: latest.content,
        position: update.position,
        version: latest.version + 1,
        created_at: now,
        created_by: user.id,
        is_deleted: false
      };
    })
    .filter(Boolean);

  if (inserts.length === 0) {
    return NextResponse.json({ updated: [] });
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('blocks')
    .insert(inserts)
    .select('id, logical_id, position, version');

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await touchRecentPage({ userId: user.id, pageId, accessedAt: now });
  await updateLastActivity({ userId: user.id, lastActivityAt: now });

  return NextResponse.json({ updated: inserted });
}
