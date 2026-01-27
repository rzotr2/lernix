import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const allowedExtensions = new Set([
  'pdf',
  'docx',
  'md',
  'txt',
  'png',
  'jpg',
  'jpeg',
  'webp'
]);
const allowedMimeTypes = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'image/webp'
]);

function getSupabaseClient(token: string) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        }
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    }
  );
}

async function getAuthedUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return { user: null };
  }

  const supabase = getSupabaseClient(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { user: null };
  }

  return { user: data.user, supabase };
}

async function getPage(pageId: string, supabase: ReturnType<typeof getSupabaseClient>) {
  const { data } = await supabase
    .from('pages')
    .select('id, owner_id')
    .eq('id', pageId)
    .maybeSingle();
  return data || null;
}

function getFileExtension(filename: string) {
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function sanitizeFilename(filename: string) {
  const base = filename.split('/').pop() || filename;
  return base.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function parseFile(
  buffer: Buffer,
  extension: string
): Promise<string | null> {
  try {
    if (extension === 'pdf') {
      const pdfParse = (await import('pdf-parse')).default;
      const result = await pdfParse(buffer);
      return result.text || null;
    }

    if (extension === 'docx') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value || null;
    }

    if (extension === 'md' || extension === 'txt') {
      return buffer.toString('utf-8');
    }

    return null;
  } catch (error) {
    console.error('Attachment parsing failed:', error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth?.user || !auth.supabase) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { user, supabase } = auth;

  const { searchParams } = new URL(request.url);
  const pageId = searchParams.get('pageId');

  if (!pageId) {
    return NextResponse.json({ error: 'Missing pageId' }, { status: 400 });
  }

  const page = await getPage(pageId, supabase);
  if (!page || page.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('attachments')
    .select('id,page_id,filename,file_type,file_size,storage_path,created_at,uploaded_by')
    .eq('page_id', pageId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const attachmentsWithUrls = await Promise.all(
    (data || []).map(async (attachment) => {
      const { data: signed, error: signedError } = await supabase.storage
        .from('attachments')
        .createSignedUrl(attachment.storage_path, 60 * 5);

      if (signedError) {
        console.error('Signed URL error:', signedError);
      }

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

  return NextResponse.json({ attachments: attachmentsWithUrls });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth?.user || !auth.supabase) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { user, supabase } = auth;

  const formData = await request.formData();
  const pageId = String(formData.get('page_id') || '');
  const file = formData.get('file');

  if (!pageId || !file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file or page_id' }, { status: 400 });
  }

  const page = await getPage(pageId, supabase);
  if (!page || page.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: 'File too large' }, { status: 400 });
  }

  const extension = getFileExtension(file.name);
  if (!allowedExtensions.has(extension)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
  }

  if (file.type && !allowedMimeTypes.has(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
  }

  const attachmentId = crypto.randomUUID();
  const safeFilename = sanitizeFilename(file.name);
  const storagePath = `${user.id}/${pageId}/${attachmentId}/${safeFilename}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from('attachments')
    .upload(storagePath, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const parsedText = await parseFile(buffer, extension);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('attachments')
    .insert({
      id: attachmentId,
      page_id: pageId,
      filename: safeFilename,
      file_type: file.type || 'application/octet-stream',
      file_size: file.size,
      storage_path: storagePath,
      parsed_text: parsedText,
      created_at: now,
      uploaded_by: user.id
    })
    .select('id,page_id,filename,file_type,file_size,created_at,uploaded_by')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ attachment: data }, { status: 201 });
}
