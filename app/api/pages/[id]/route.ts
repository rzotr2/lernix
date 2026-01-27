import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase-admin';

type UpdatePayload = {
  title?: string;
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

async function getDescendantIds(
  ownerId: string,
  rootId: string
) {
  const { data } = await supabaseAdmin
    .from('pages')
    .select('id,parent_page_id')
    .eq('owner_id', ownerId);

  if (!data) return [rootId];

  const descendants = new Set<string>();
  const stack = [rootId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    descendants.add(current);
    data
      .filter((page) => page.parent_page_id === current)
      .forEach((page) => {
        if (!descendants.has(page.id)) {
          stack.push(page.id);
        }
      });
  }

  return Array.from(descendants);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user } = await getAuthedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as UpdatePayload;
  const title = (body.title || '').trim();

  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('pages')
    .update({ title, updated_at: now })
    .eq('id', id)
    .eq('owner_id', user.id)
    .select('id,title,slug,parent_page_id,owner_id,created_at,updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  return NextResponse.json({ page: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user } = await getAuthedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const idsToDelete = await getDescendantIds(user.id, id);

  const { error } = await supabaseAdmin
    .from('pages')
    .delete()
    .in('id', idsToDelete)
    .eq('owner_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: idsToDelete });
}
