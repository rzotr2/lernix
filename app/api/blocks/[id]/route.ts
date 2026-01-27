import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase-admin';

type UpdatePayload = {
  content?: Record<string, unknown>;
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

async function getBlockById(id: string) {
  const { data } = await supabaseAdmin
    .from('blocks')
    .select('id, page_id, logical_id, type, content, position, version, created_by')
    .eq('id', id)
    .maybeSingle();

  return data || null;
}

async function isOwner(pageId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from('pages')
    .select('id, owner_id')
    .eq('id', pageId)
    .maybeSingle();

  return data?.owner_id === userId;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getAuthedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as UpdatePayload;
  const content = body.content || {};

  const existing = await getBlockById(id);
  if (!existing) {
    return NextResponse.json({ error: 'Block not found' }, { status: 404 });
  }

  const canAccess = await isOwner(existing.page_id, user.id);
  if (!canAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('blocks')
    .insert({
      page_id: existing.page_id,
      logical_id: existing.logical_id,
      type: existing.type,
      content,
      position: existing.position,
      version: existing.version + 1,
      created_at: new Date().toISOString(),
      created_by: user.id,
      is_deleted: false
    })
    .select('id, page_id, logical_id, type, content, position, version, created_at, created_by, is_deleted')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ block: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getAuthedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const existing = await getBlockById(id);
  if (!existing) {
    return NextResponse.json({ error: 'Block not found' }, { status: 404 });
  }

  const canAccess = await isOwner(existing.page_id, user.id);
  if (!canAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('blocks')
    .insert({
      page_id: existing.page_id,
      logical_id: existing.logical_id,
      type: existing.type,
      content: existing.content,
      position: existing.position,
      version: existing.version + 1,
      created_at: new Date().toISOString(),
      created_by: user.id,
      is_deleted: true
    })
    .select('id, page_id, logical_id, type, content, position, version, created_at, created_by, is_deleted')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ block: data });
}
