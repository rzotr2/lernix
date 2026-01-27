import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase-admin';

export const runtime = 'nodejs';

type GeneratePayload = {
  page_id?: string;
  language?: 'en' | 'de' | 'uk';
  selected_content_types?: string[];
  user_preferences?: string;
};

const MODEL = 'gpt-4.1-mini';
const MAX_CONTEXT_CHARS = 12000;
const allowedTypes = new Set([
  'heading',
  'paragraph',
  'callout',
  'code',
  'table',
  'timeline',
  'quiz',
  'flashcard',
  'mermaid',
  'graph'
]);

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
    .select('id, owner_id, title')
    .eq('id', pageId)
    .maybeSingle();

  return data || null;
}

function normalizeText(input: string) {
  return input.replace(/\s+/g, ' ').trim();
}

function truncateText(input: string, maxChars: number) {
  if (input.length <= maxChars) return input;
  return input.slice(0, maxChars);
}

function buildPrompt({
  pageTitle,
  manualContent,
  attachmentContent,
  language,
  selectedContentTypes,
  userPreferences
}: {
  pageTitle: string;
  manualContent: string;
  attachmentContent: string;
  language: string;
  selectedContentTypes: string[];
  userPreferences: string;
}) {
  const systemPrompt = [
    'You are an educational assistant.',
    'Return ONLY valid JSON matching this schema:',
    '{ "blocks": [ { "type": "...", "content": { ... } } ] }',
    'No prose outside JSON.',
    'No HTML, no Markdown.',
    'Only use these block types: heading, paragraph, callout, code, table, timeline, quiz, flashcard, mermaid, graph.',
    `Use language: ${language}.`,
    'Keep output structured and concise for learning.'
  ].join(' ');

  const userPrompt = [
    `Page title: ${pageTitle || 'Untitled'}.`,
    `Selected content types: ${selectedContentTypes.join(', ') || 'all'}.`,
    userPreferences ? `User preferences: ${userPreferences}.` : 'User preferences: none.',
    manualContent ? `Page content: ${manualContent}` : 'Page content: empty.',
    attachmentContent ? `Attachment text: ${attachmentContent}` : 'Attachment text: none.'
  ].join('\n');

  return { systemPrompt, userPrompt };
}

function parseJsonResponse(text: string) {
  const trimmed = text.trim();
  return JSON.parse(trimmed);
}

function validateBlocksPayload(payload: any) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.blocks)) {
    throw new Error('Invalid AI response');
  }

  payload.blocks.forEach((block: any) => {
    if (!block || typeof block !== 'object') {
      throw new Error('Invalid block');
    }
    if (!allowedTypes.has(block.type)) {
      throw new Error('Unsupported block type');
    }
    if (!block.content || typeof block.content !== 'object') {
      throw new Error('Invalid block content');
    }
  });
}

function validateBlockContent(block: any) {
  const content = block.content || {};
  switch (block.type) {
    case 'heading':
      if (typeof content.text !== 'string') throw new Error('Invalid heading content');
      if (content.level !== undefined && typeof content.level !== 'number') {
        throw new Error('Invalid heading level');
      }
      return;
    case 'paragraph':
      if (typeof content.text !== 'string') throw new Error('Invalid paragraph content');
      return;
    case 'callout':
      if (typeof content.text !== 'string') throw new Error('Invalid callout content');
      return;
    case 'code':
      if (typeof content.code !== 'string') throw new Error('Invalid code content');
      return;
    case 'table':
      if (!Array.isArray(content.rows)) throw new Error('Invalid table content');
      return;
    case 'timeline':
      if (!Array.isArray(content.items)) throw new Error('Invalid timeline content');
      return;
    case 'quiz':
      if (!Array.isArray(content.questions)) throw new Error('Invalid quiz content');
      return;
    case 'flashcard':
      if (!Array.isArray(content.cards)) throw new Error('Invalid flashcard content');
      return;
    case 'mermaid':
      if (typeof content.code !== 'string') throw new Error('Invalid mermaid content');
      return;
    case 'graph':
      if (!Array.isArray(content.nodes) || !Array.isArray(content.edges)) {
        throw new Error('Invalid graph content');
      }
      return;
    default:
      throw new Error('Unsupported block type');
  }
}

export async function POST(request: NextRequest) {
  const { user } = await getAuthedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as GeneratePayload;
  const pageId = body.page_id;
  const language = body.language || 'en';
  const selectedContentTypes = Array.isArray(body.selected_content_types)
    ? body.selected_content_types
    : [];
  const userPreferences = (body.user_preferences || '').trim();

  if (!pageId || !language) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const page = await getPageOwner(pageId);
  if (!page || page.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: blocksData, error: blocksError } = await supabaseAdmin
    .from('blocks')
    .select('logical_id, type, content, position, version, is_deleted')
    .eq('page_id', pageId)
    .order('version', { ascending: false });

  if (blocksError) {
    return NextResponse.json({ error: blocksError.message }, { status: 500 });
  }

  const latestMap = new Map<string, typeof blocksData[number]>();
  blocksData?.forEach((block) => {
    if (!latestMap.has(block.logical_id)) {
      latestMap.set(block.logical_id, block);
    }
  });

  const manualBlocks = Array.from(latestMap.values())
    .filter((block) => !block.is_deleted)
    .sort((a, b) => a.position - b.position);

  const manualContent = normalizeText(
    manualBlocks
      .map((block) => {
        switch (block.type) {
          case 'heading':
            return block.content?.text || '';
          case 'paragraph':
            return block.content?.text || '';
          case 'callout':
            return block.content?.text || '';
          case 'code':
            return block.content?.code || '';
          case 'image':
            return block.content?.alt || '';
          case 'attachment':
            return block.content?.display_name || '';
          default:
            return '';
        }
      })
      .filter(Boolean)
      .join(' ')
  );

  const { data: attachmentsData, error: attachmentsError } = await supabaseAdmin
    .from('attachments')
    .select('parsed_text')
    .eq('page_id', pageId);

  if (attachmentsError) {
    return NextResponse.json({ error: attachmentsError.message }, { status: 500 });
  }

  const attachmentContent = normalizeText(
    (attachmentsData || [])
      .map((item) => item.parsed_text || '')
      .filter(Boolean)
      .join(' ')
  );

  const combinedManual = truncateText(manualContent, MAX_CONTEXT_CHARS);
  const combinedAttachments = truncateText(attachmentContent, MAX_CONTEXT_CHARS);

  const { systemPrompt, userPrompt } = buildPrompt({
    pageTitle: page.title || '',
    manualContent: combinedManual,
    attachmentContent: combinedAttachments,
    language,
    selectedContentTypes,
    userPreferences
  });

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OpenAI key missing' }, { status: 500 });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      let errorMessage = 'OpenAI request failed';
      try {
        const errorJson = await response.json();
        if (process.env.NODE_ENV !== 'production' && errorJson?.error?.message) {
          errorMessage = `OpenAI error: ${errorJson.error.message}`;
        }
        console.error('OpenAI error:', errorJson);
      } catch {
        const errorText = await response.text();
        console.error('OpenAI error:', errorText);
      }
      return NextResponse.json({ error: errorMessage }, { status: 502 });
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const parsed = parseJsonResponse(content);
    validateBlocksPayload(parsed);
    parsed.blocks.forEach((block: any) => validateBlockContent(block));

    const currentMaxPosition =
      manualBlocks.length > 0 ? manualBlocks[manualBlocks.length - 1].position : 0;
    let position = currentMaxPosition;
    const now = new Date().toISOString();

    const rows = parsed.blocks.map((block: any, index: number) => {
      position += 1 + index * 0.01;
      return {
        page_id: pageId,
        logical_id: crypto.randomUUID(),
        type: block.type,
        content: block.content,
        position,
        version: 1,
        created_at: now,
        created_by: user.id,
        is_deleted: false
      };
    });

    const { error: insertError } = await supabaseAdmin.from('blocks').insert(rows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('AI generation failed:', error);
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
  }
}
