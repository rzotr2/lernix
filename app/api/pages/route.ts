import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { slugifyTitle } from '@/utils/slug';
import { supabaseAdmin } from '@/utils/supabase-admin';
import { incrementDailyActivity, incrementUserStats, touchRecentPage } from '@/utils/dashboard-stats';

type CreatePagePayload = {
  title?: string;
  parent_page_id?: string | null;
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

async function generateUniqueSlug(
  ownerId: string,
  baseTitle: string
) {
  const baseSlug = slugifyTitle(baseTitle) || 'untitled';
  let slug = baseSlug;
  let suffix = 2;

  while (true) {
    const { data } = await supabaseAdmin
      .from('pages')
      .select('id')
      .eq('owner_id', ownerId)
      .eq('slug', slug)
      .maybeSingle();

    if (!data) {
      return slug;
    }

    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

export async function GET(request: NextRequest) {
  const { user } = await getAuthedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('pages')
    .select('id,title,slug,parent_page_id,owner_id,is_favorite,created_at,updated_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ pages: data });
}

export async function POST(request: NextRequest) {
  const { user } = await getAuthedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as CreatePagePayload;
  const title = (body.title || '').trim();
  const parentPageId = body.parent_page_id || null;

  console.log('[dashboard] create page request', { userId: user.id, title, parentPageId });

  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  if (parentPageId) {
    const { data: parent } = await supabaseAdmin
      .from('pages')
      .select('id')
      .eq('id', parentPageId)
      .eq('owner_id', user.id)
      .maybeSingle();

    if (!parent) {
      return NextResponse.json({ error: 'Parent page not found' }, { status: 404 });
    }
  }

  const slug = await generateUniqueSlug(user.id, title);
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('pages')
    .insert({
      title,
      slug,
      parent_page_id: parentPageId,
      owner_id: user.id,
      is_favorite: false,
      created_at: now,
      updated_at: now
    })
    .select('id,title,slug,parent_page_id,owner_id,is_favorite,created_at,updated_at')
    .single();

  if (error) {
    console.log('[dashboard] create page insert failed', { userId: user.id, error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log('[dashboard] create page success', { userId: user.id, pageId: data.id });

  await incrementUserStats({
    userId: user.id,
    pagesDelta: 1,
    lastActivityAt: now
  });
  await incrementDailyActivity({ userId: user.id, pagesCreatedDelta: 1 });
  await touchRecentPage({ userId: user.id, pageId: data.id, accessedAt: now });

  console.log('[dashboard] stats updated for page create', { userId: user.id, pageId: data.id });

  return NextResponse.json({ page: data }, { status: 201 });
}
