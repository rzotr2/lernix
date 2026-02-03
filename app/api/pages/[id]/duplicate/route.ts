import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase-admin';
import { incrementDailyActivity, incrementUserStats, touchRecentPage } from '@/utils/dashboard-stats';
import { slugifyTitle } from '@/utils/slug';

type BlockRow = {
  logical_id: string;
  type: string;
  content: Record<string, unknown>;
  position: number;
  version: number;
  is_deleted: boolean;
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

async function generateUniqueSlug(ownerId: string, baseTitle: string) {
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getAuthedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { data: sourcePage, error: pageError } = await supabaseAdmin
    .from('pages')
    .select('id,title,slug,parent_page_id,owner_id,created_at,updated_at')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single();

  if (pageError) {
    return NextResponse.json({ error: pageError.message }, { status: 500 });
  }

  if (!sourcePage) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  const baseTitle = sourcePage.title || 'Untitled';
  const title = `${baseTitle} Copy`;
  const slug = await generateUniqueSlug(user.id, title);
  const now = new Date().toISOString();

  const { data: newPage, error: insertError } = await supabaseAdmin
    .from('pages')
    .insert({
      title,
      slug,
      parent_page_id: sourcePage.parent_page_id,
      owner_id: user.id,
      created_at: now,
      updated_at: now,
      is_favorite: false
    })
    .select('id,title,slug,parent_page_id,owner_id,created_at,updated_at,is_favorite')
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { data: attachments } = await supabaseAdmin
    .from('attachments')
    .select('id,filename,file_type,file_size,storage_path,parsed_text,uploaded_by')
    .eq('page_id', sourcePage.id);

  const attachmentIdMap = new Map<string, string>();
  if (attachments && attachments.length > 0) {
    const copied = await Promise.all(
      attachments.map(async (attachment) => {
        const newAttachmentId = crypto.randomUUID();
        const safeFilename = attachment.filename;
        const newStoragePath = `${user.id}/${newPage.id}/${newAttachmentId}/${safeFilename}`;
        const { error: copyError } = await supabaseAdmin.storage
          .from('attachments')
          .copy(attachment.storage_path, newStoragePath);

        if (copyError) {
          throw new Error(copyError.message);
        }

        attachmentIdMap.set(attachment.id, newAttachmentId);

        return {
          id: newAttachmentId,
          page_id: newPage.id,
          filename: attachment.filename,
          file_type: attachment.file_type,
          file_size: attachment.file_size,
          storage_path: newStoragePath,
          parsed_text: attachment.parsed_text ?? null,
          created_at: now,
          uploaded_by: user.id
        };
      })
    );

    const { error: attachmentInsertError } = await supabaseAdmin
      .from('attachments')
      .insert(copied);

    if (attachmentInsertError) {
      return NextResponse.json({ error: attachmentInsertError.message }, { status: 500 });
    }
  }

  const { data: blocks } = await supabaseAdmin
    .from('blocks')
    .select('logical_id,type,content,position,version,is_deleted')
    .eq('page_id', sourcePage.id)
    .order('version', { ascending: false });

  const rows = (blocks as unknown as BlockRow[] | null) || [];
  const latestMap = new Map<string, BlockRow>();
  rows.forEach((block) => {
    if (!latestMap.has(block.logical_id)) {
      latestMap.set(block.logical_id, block);
    }
  });

  const latestBlocks = Array.from(latestMap.values()).filter((block) => !block.is_deleted);

  if (latestBlocks.length > 0) {
    const inserts = latestBlocks.map((block) => {
      const newLogicalId = crypto.randomUUID();
      const content = { ...(block.content || {}) };
      const attachmentId = (content as { attachment_id?: string }).attachment_id;
      if (block.type === 'attachment' && attachmentId) {
        const replacement = attachmentIdMap.get(attachmentId);
        if (replacement) {
          (content as { attachment_id?: string }).attachment_id = replacement;
        }
      }
      return {
        page_id: newPage.id,
        logical_id: newLogicalId,
        type: block.type,
        content,
        position: block.position,
        version: 1,
        created_at: now,
        created_by: user.id,
        is_deleted: false
      };
    });

    const { error: blockInsertError } = await supabaseAdmin
      .from('blocks')
      .insert(inserts);

    if (blockInsertError) {
      return NextResponse.json({ error: blockInsertError.message }, { status: 500 });
    }
  }

  await incrementUserStats({
    userId: user.id,
    pagesDelta: 1,
    lastActivityAt: now
  });
  await incrementDailyActivity({ userId: user.id, pagesCreatedDelta: 1 });
  await touchRecentPage({ userId: user.id, pageId: newPage.id, accessedAt: now });

  return NextResponse.json({ page: newPage }, { status: 201 });
}
