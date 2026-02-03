import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const { data: pages, error: pageError } = await supabaseAdmin
    .from('pages')
    .select('id,title,slug,parent_page_id,owner_id,created_at,updated_at')
    .eq('slug', slug)
    .order('created_at', { ascending: true })
    .limit(1);

  if (pageError) {
    return NextResponse.json({ error: pageError.message }, { status: 500 });
  }

  const page = pages?.[0] || null;
  if (!page) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: blocks, error: blocksError } = await supabaseAdmin
    .from('blocks')
    .select('id, page_id, logical_id, type, content, position, version, created_at, created_by, is_deleted')
    .eq('page_id', page.id)
    .order('version', { ascending: false });

  if (blocksError) {
    return NextResponse.json({ error: blocksError.message }, { status: 500 });
  }

  const latestMap = new Map<string, (typeof blocks)[number]>();
  (blocks || []).forEach((block) => {
    if (!latestMap.has(block.logical_id)) {
      latestMap.set(block.logical_id, block);
    }
  });

  const resolvedBlocks = Array.from(latestMap.values())
    .filter((block) => !block.is_deleted)
    .sort((a, b) => a.position - b.position);

  const { data: attachments, error: attachmentError } = await supabaseAdmin
    .from('attachments')
    .select('id,page_id,filename,file_type,file_size,storage_path,created_at,uploaded_by')
    .eq('page_id', page.id)
    .order('created_at', { ascending: true });

  if (attachmentError) {
    return NextResponse.json({ error: attachmentError.message }, { status: 500 });
  }

  const attachmentsWithUrls = await Promise.all(
    (attachments || []).map(async (attachment) => {
      const { data: signed } = await supabaseAdmin.storage
        .from('attachments')
        .createSignedUrl(attachment.storage_path, 60 * 5);

      return {
        id: attachment.id,
        page_id: attachment.page_id,
        filename: attachment.filename,
        file_type: attachment.file_type,
        file_size: attachment.file_size,
        created_at: attachment.created_at,
        uploaded_by: attachment.uploaded_by,
        signed_url: signed?.signedUrl || null
      };
    })
  );

  return NextResponse.json({
    page,
    blocks: resolvedBlocks,
    attachments: attachmentsWithUrls
  });
}
