import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase-admin';

type CreateBlockPayload = {
  page_id?: string;
  type?: string;
  content?: Record<string, unknown>;
  position?: number;
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

async function getPageOwner(pageId: string) {
  const { data } = await supabaseAdmin
    .from('pages')
    .select('id, owner_id')
    .eq('id', pageId)
    .maybeSingle();

  return data || null;
}

export async function GET(request: NextRequest) {
  const { user } = await getAuthedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const pageId = searchParams.get('pageId');

  if (!pageId) {
    return NextResponse.json({ error: 'Missing pageId' }, { status: 400 });
  }

  const page = await getPageOwner(pageId);
  if (!page || page.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('blocks')
    .select('id, page_id, logical_id, type, content, position, version, created_at, created_by, is_deleted')
    .eq('page_id', pageId)
    .order('version', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const latestMap = new Map<string, typeof data[number]>();
  data?.forEach((block) => {
    if (!latestMap.has(block.logical_id)) {
      latestMap.set(block.logical_id, block);
    }
  });

  const blocks = Array.from(latestMap.values())
    .filter((block) => !block.is_deleted)
    .sort((a, b) => a.position - b.position);

  return NextResponse.json({ blocks });
}

export async function POST(request: NextRequest) {
  const { user } = await getAuthedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as CreateBlockPayload;
  const pageId = body.page_id;
  const type = body.type;
  const content = body.content || {};
  const position = body.position;

  if (!pageId || !type || position === undefined) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const page = await getPageOwner(pageId);
  if (!page || page.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const logicalId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('blocks')
    .insert({
      page_id: pageId,
      logical_id: logicalId,
      type,
      content,
      position,
      version: 1,
      created_at: now,
      created_by: user.id,
      is_deleted: false
    })
    .select('id, page_id, logical_id, type, content, position, version, created_at, created_by, is_deleted')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ block: data }, { status: 201 });
}
