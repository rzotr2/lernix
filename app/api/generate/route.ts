import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase-admin';
import {
  incrementDailyActivity,
  incrementUserStats,
  markPageAiUsage,
  touchRecentPage
} from '@/utils/dashboard-stats';

export const runtime = 'nodejs';

type GeneratePayload = {
  page_id?: string;
  language_code?: string;
  mode?: 'educational' | 'standard';
  selected_content_types?: string[];
  use_page_context?: boolean;
  sources?: Array<{ type: 'file' | 'text'; content: string }>;
  page_context?: string;
  user_preferences?: string;
};

type AiSpan = {
  start: number;
  end: number;
  emphasis?: 'soft' | 'strong';
  color_token?: string;
  text?: string;
};

type AiBlock = {
  type: string;
  content: Record<string, unknown>;
  style?: Record<string, unknown>;
};

type AiPayload = {
  blocks: AiBlock[];
};

type StoredBlock = {
  logical_id: string;
  type: string;
  content: Record<string, unknown>;
  position: number;
  version: number;
  is_deleted?: boolean;
};

type ChecklistItem = { text?: string; checked?: boolean };

const MODEL = 'gpt-4.1-mini';
const MAX_CONTEXT_CHARS = 12000;
const allowedTypes = new Set([
  'heading',
  'paragraph',
  'quote',
  'callout',
  'list',
  'checklist',
  'definitions',
  'code',
  'image',
  'divider',
  'table',
  'timeline',
  'steps',
  'quiz',
  'flashcard',
  'flashcard_deck',
  'faq',
  'summary',
  'takeaways',
  'mermaid',
  'graph'
]);

const educationalAllowedTypes = new Set([
  'heading',
  'paragraph',
  'callout',
  'bullet_list',
  'numbered_list',
  'code',
  'divider',
  'table'
]);

const COLOR_TOKENS = new Set([
  'neutral-glass',
  'accent-soft',
  'accent-focus',
  'accent-muted',
  'warning-soft',
  'success-soft'
]);

const typeAliases: Record<string, string> = {
  headings: 'heading',
  heading: 'heading',
  paragraphs: 'paragraph',
  paragraph: 'paragraph',
  quote: 'quote',
  quotes: 'quote',
  notes: 'paragraph',
  note: 'paragraph',
  callouts: 'callout',
  callout: 'callout',
  codeblock: 'code',
  'code-block': 'code',
  code: 'code',
  images: 'image',
  image: 'image',
  divider: 'divider',
  separators: 'divider',
  tables: 'table',
  table: 'table',
  timelines: 'timeline',
  timeline: 'timeline',
  steps: 'steps',
  process: 'steps',
  checklist: 'checklist',
  checklists: 'checklist',
  list: 'list',
  lists: 'list',
  definitions: 'definitions',
  definition: 'definitions',
  quizzes: 'quiz',
  quiz: 'quiz',
  flashcards: 'flashcard_deck',
  'flash-card': 'flashcard',
  flashcard: 'flashcard',
  'flashcard-deck': 'flashcard_deck',
  faq: 'faq',
  faqs: 'faq',
  summary: 'summary',
  takeaways: 'takeaways',
  takeaway: 'takeaways',
  diagrams: 'mermaid',
  diagram: 'mermaid',
  graphs: 'graph',
  graph: 'graph',
  mermaid: 'mermaid'
};

function normalizeBlockType(type: unknown): string {
  if (typeof type !== 'string') return '';
  const normalized = type.trim().toLowerCase();
  return typeAliases[normalized] || normalized;
}

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
  userPreferences,
  sourcesContent
}: {
  pageTitle: string;
  manualContent: string;
  attachmentContent: string;
  language: string;
  selectedContentTypes: string[];
  userPreferences: string;
  sourcesContent: string;
}) {
  const systemPrompt = [
    'You are an educational assistant.',
    'Return ONLY valid JSON matching this schema:',
    '{ "blocks": [ { "type": "...", "content": { ... } } ] }',
    'No prose outside JSON.',
    'No HTML, no Markdown.',
    'Only use these block types: heading, paragraph, quote, callout, list, checklist, definitions, code, image, divider, table, timeline, steps, quiz, flashcard, flashcard_deck, faq, summary, takeaways, mermaid, graph.',
    `Use language: ${language}.`,
    'Keep output structured and concise for learning.',
    'Schemas:',
    'heading: { text: string, level?: number, subtitle?: string|null }',
    'paragraph: { text: string, size?: "xs"|"sm"|"md"|"lg", tone?: "normal"|"muted"|"lead", align?: "left"|"center" }',
    'quote: { text: string, author?: string|null, source?: string|null }',
    'callout: { text: string, variant?: "info"|"note"|"warning"|"tip"|"example"|"definition"|"summary", title?: string|null }',
    'list: { ordered: boolean, items: string[], nested?: boolean }',
    'checklist: { items: { text: string, checked?: boolean }[] }',
    'definitions: { items: { term: string, definition: string }[] }',
    'code: { code: string, language?: string }',
    'image: { url: string, alt?: string, caption?: string|null, size?: "sm"|"md"|"lg", align?: "left"|"center"|"right" }',
    'divider: { label?: string|null, style?: "line"|"space"|"dotted" }',
    'table: { columns?: string[], rows: string[][], caption?: string|null }',
    'timeline: { items: { title: string, description: string, order?: string|number }[] }',
    'steps: { steps: { title: string, description: string }[] }',
    'quiz: { question: string, options: string[], correctIndex?: number, explanation?: string }',
    'flashcard: { front: string, back: string }',
    'flashcard_deck: { cards: { front: string, back: string }[] }',
    'faq: { items: { question: string, answer: string }[] }',
    'summary: { text: string }',
    'takeaways: { items: string[] }',
    'mermaid: { code: string }',
    'graph: { nodes: { id: string, label?: string }[], edges: { from: string, to: string, label?: string }[] }'
  ].join(' ');

  const userPrompt = [
    `Page title: ${pageTitle || 'Untitled'}.`,
    `Selected content types: ${selectedContentTypes.join(', ') || 'all'}.`,
    userPreferences ? `User preferences: ${userPreferences}.` : 'User preferences: none.',
    sourcesContent ? `Sources: ${sourcesContent}` : 'Sources: none.',
    manualContent ? `Page content: ${manualContent}` : 'Page content: empty.',
    attachmentContent ? `Attachment text: ${attachmentContent}` : 'Attachment text: none.'
  ].join('\n');

  return { systemPrompt, userPrompt };
}

const EDUCATIONAL_BLOCK_TYPES =
  'heading, paragraph, callout, bullet_list, numbered_list, code, divider, table';

function buildEducationalPrompt({
  pageTitle,
  manualContent,
  attachmentContent,
  language,
  sourcesContent
}: {
  pageTitle: string;
  manualContent: string;
  attachmentContent: string;
  language: string;
  sourcesContent: string;
}) {
  const systemPrompt = [
    'You are an AI content generator for a modern, Notion-like block editor with a 2026 glassy, minimal design system. You are generating a COMPLETE, READY-TO-READ LEARNING PAGE. You are NOT allowed to be conservative by default. Your job is to balance semantic correctness WITH visual diversity. If both are plausible, you MUST favor diversity.',
    'Output ONLY semantic JSON: { "blocks": [ { "type": "...", "content": { ... }, "style"?: {} } ] }. No HTML, no Markdown. Append blocks to the end of the page. Blocks are immutable (append-only). Do not reference other pages or documents.',
    `Use ONLY these block types: ${EDUCATIONAL_BLOCK_TYPES}.`,
    'Block schemas: heading: { text: string, level?: 1|2|3, subtitle?: string|null, spans?: Span[] }. paragraph: { text: string, spans?: Span[] }. callout: { text: string, title?: string|null, color_token?: ColorToken, spans?: Span[] }. bullet_list: { items: string[] }. numbered_list: { items: string[] }. code: { code: string, language?: string }. divider: { label?: string|null, style?: "line"|"space"|"dotted" }. table: { columns?: string[], rows: string[][], caption?: string|null }. Inline span: { start: number, end: number, text: string, emphasis?: "soft"|"strong", color_token?: ColorToken }.',
    'STRUCTURAL DIVERSITY — HARD REQUIREMENTS. Paragraphs are NOT the default. Use paragraph ONLY if the content cannot reasonably be a list, a callout, or a table. If there are 2 or more parallel ideas use a list. If there are steps, order, progression use numbered_list. Lists are preferred over paragraphs when possible. If content compares 2+ properties across 2+ items table is REQUIRED; do NOT explain comparisons in paragraphs. Every section (content under a heading) MUST contain at least one callout. Insert a divider after every major section OR after 5–7 blocks, whichever comes first. Page-level quota: at least 1 table OR code block; at least 2 callouts with different semantic roles; at least 1 list per section. If not satisfied, restructure content until it is.',
    'COLOR SYSTEM — HARD. Color is NOT optional. Allowed tokens: neutral-glass, accent-soft, accent-focus, accent-muted, warning-soft, success-soft. At least 30% of blocks on the page MUST have a non-neutral color token. Every section MUST contain at least one block with a non-neutral color token. Callouts MUST use a color token matching their semantic role: definition/core idea → accent-focus; explanation/example → accent-soft; warning/limitation → warning-soft; best practice/takeaway → success-soft. Callouts without color are INVALID. Every section MUST include at least one inline emphasized span with a color token. Inline emphasis is REQUIRED. Max 2 color tokens per block. Max 3 colored blocks in a row. No traffic light patterns. If you hit a conflict you may use neutral-glass temporarily but MUST compensate later in the same section to meet quotas.',
    'INLINE EMPHASIS POLICY — HARD. Inline color is semantic, not decorative. Use inline color ONLY for defined key terms, explicitly named concepts, or clearly bounded noun phrases. Do NOT use it for adjectives alone, function words, or stylistic emphasis. Each emphasized concept must be a single span. Do NOT split phrases or emit multiple adjacent spans for one phrase. spans[].text MUST exactly match the full phrase as it appears in the text. If unsure, DO NOT emit a span. Prefer under-highlighting over over-highlighting.',
    'IMPORTANCE. Every section MUST have exactly ONE core idea (accent-focus) and at least ONE supporting highlight (accent-soft or accent-muted). If importance is ambiguous choose a plausible importance; do NOT skip emphasis due to uncertainty. Semantic precision is important but under-emphasis is a failure.',
    'Tone: clear, didactic, calm, modern. No fluff. Optimized for learning and scanning.',
    'FAILURE. Your output is INVALID if: large stretches of paragraphs appear without lists or callouts; an entire section has only neutral blocks; callouts exist but share the same color role; color is used only once or twice just to comply; visual rhythm feels uniform.',
    'Return a JSON array of blocks. Each block MUST include type, content, and style metadata including color tokens when applicable.',
    `Use language: ${language}.`
  ].join(' ');

  const userPrompt = [
    `Page title: ${pageTitle || 'Untitled'}.`,
    sourcesContent ? `Sources: ${sourcesContent}` : 'Sources: none.',
    manualContent ? `Existing page content (for context): ${manualContent}` : 'Page content: empty.',
    attachmentContent ? `Attachment text: ${attachmentContent}` : 'Attachment text: none.'
  ].join('\n');

  return { systemPrompt, userPrompt };
}

function parseJsonResponse(text: string): unknown {
  const trimmed = text.trim();
  return JSON.parse(trimmed);
}

function validateBlocksPayload(payload: unknown, isEducational = false): AiPayload {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { blocks?: unknown }).blocks)) {
    throw new Error('Invalid AI response');
  }

  const typeSet = isEducational ? educationalAllowedTypes : allowedTypes;
  const blocks = (payload as { blocks: AiBlock[] }).blocks;
  blocks.forEach((block) => {
    if (!block || typeof block !== 'object') {
      throw new Error('Invalid block');
    }
    block.type = normalizeBlockType(block.type);
    if (!typeSet.has(block.type)) {
      throw new Error('Unsupported block type');
    }
    if (!block.content || typeof block.content !== 'object') {
      throw new Error('Invalid block content');
    }
  });
  return { blocks };
}

function normalizeColorContract(block: AiBlock) {
  const next = { ...block };
  const content = { ...(block.content || {}) } as Record<string, unknown>;
  const style = (block.style || {}) as Record<string, unknown>;
  if ((content as { color_token?: unknown }).color_token == null && (content as { colorToken?: unknown }).colorToken != null) {
    (content as { color_token?: unknown }).color_token = (content as { colorToken?: unknown }).colorToken;
  }
  if ((content as { color_token?: unknown }).color_token == null && (style as { color_token?: unknown }).color_token != null) {
    (content as { color_token?: unknown }).color_token = (style as { color_token?: unknown }).color_token;
  }
  if ((content as { color_token?: unknown }).color_token == null && (style as { colorToken?: unknown }).colorToken != null) {
    (content as { color_token?: unknown }).color_token = (style as { colorToken?: unknown }).colorToken;
  }
  if ('colorToken' in content) {
    delete (content as { colorToken?: unknown }).colorToken;
  }
  next.content = content;
  if ('style' in next) {
    delete next.style;
  }
  return next;
}

function validateSpan(span: AiSpan, textLength: number) {
  if (!span || typeof span !== 'object') return false;
  const start = Number(span.start);
  const end = Number(span.end);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > textLength || start >= end) {
    return false;
  }
  if (span.emphasis !== undefined && !['soft', 'strong'].includes(span.emphasis)) return false;
  if (span.color_token !== undefined && !COLOR_TOKENS.has(span.color_token)) return false;
  return true;
}

function isWordChar(c: string): boolean {
  return /\w/.test(c) || /[\u0400-\u04FF]/.test(c);
}

function isBoundary(text: string, index: number): boolean {
  if (index <= 0 || index >= text.length) return true;
  return !isWordChar(text[index - 1]) || !isWordChar(text[index]);
}

function normalizeSpanText(text: string) {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function canMergeGap(gap: string): boolean {
  if (!gap) return true;
  return /^[\s.,;:!?'"()[\]{}\-–—]+$/.test(gap);
}

function normalizeInlineSpans(text: string, spans: AiSpan[]): AiSpan[] {
  if (!text || !Array.isArray(spans) || spans.length === 0) return [];
  const len = text.length;
  const filtered = spans
    .filter((s) => validateSpan(s, len))
    .map((s) => ({
      start: Number(s.start),
      end: Number(s.end),
      emphasis: s.emphasis,
      color_token: s.color_token,
      text: typeof s.text === 'string' ? s.text : undefined
    }))
    .filter((s) => {
      if (!isBoundary(text, s.start) || !isBoundary(text, s.end)) return false;
      const segment = text.slice(s.start, s.end);
      if (!segment) return false;
      if (!isWordChar(segment[0]) || !isWordChar(segment[segment.length - 1])) return false;
      if (s.text !== undefined && s.text !== segment) return false;
      return true;
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: AiSpan[] = [];
  for (const span of filtered) {
    const segment = text.slice(span.start, span.end);
    const next = { ...span, text: segment };
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.color_token === next.color_token &&
      prev.end <= next.start &&
      canMergeGap(text.slice(prev.end, next.start))
    ) {
      prev.end = next.end;
      prev.text = text.slice(prev.start, prev.end);
      continue;
    }
    if (prev && next.start < prev.end) {
      continue;
    }
    merged.push(next);
  }

  const seen = new Set<string>();
  const deduped: AiSpan[] = [];
  for (const span of merged) {
    const key = normalizeSpanText(span.text || '');
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(span);
  }

  return deduped;
}

function countDistinctColorTokensInBlock(block: AiBlock): number {
  const content = (block.content || {}) as Record<string, unknown>;
  const tokens = new Set<string>();
  const blockColor = (content as { color_token?: string }).color_token;
  if (blockColor && COLOR_TOKENS.has(blockColor)) {
    tokens.add(blockColor);
  }
  const spans = Array.isArray((content as { spans?: unknown }).spans)
    ? ((content as { spans: AiSpan[] }).spans || [])
    : [];
  spans.forEach((s) => {
    if (s?.color_token && COLOR_TOKENS.has(s.color_token)) tokens.add(s.color_token);
  });
  return tokens.size;
}

function validateEducationalBlockContent(block: AiBlock) {
  const content = (block.content || {}) as Record<string, unknown>;
  switch (block.type) {
    case 'heading':
      if (typeof (content as { text?: unknown }).text !== 'string') throw new Error('Invalid heading content');
      if ((content as { level?: unknown }).level !== undefined && ![1, 2, 3].includes(Number((content as { level?: unknown }).level))) {
        throw new Error('Invalid heading level');
      }
      if ((content as { subtitle?: unknown }).subtitle !== undefined && (content as { subtitle?: unknown }).subtitle !== null && typeof (content as { subtitle?: unknown }).subtitle !== 'string') {
        throw new Error('Invalid heading subtitle');
      }
      (content as { spans?: AiSpan[] }).spans = normalizeInlineSpans(
        String((content as { text?: string }).text || ''),
        ((content as { spans?: AiSpan[] }).spans || [])
      );
      if (countDistinctColorTokensInBlock(block) > 2) {
        throw new Error('At most 2 color tokens per block');
      }
      return;
    case 'paragraph':
      if (typeof (content as { text?: unknown }).text !== 'string') throw new Error('Invalid paragraph content');
      (content as { spans?: AiSpan[] }).spans = normalizeInlineSpans(
        String((content as { text?: string }).text || ''),
        ((content as { spans?: AiSpan[] }).spans || [])
      );
      if (countDistinctColorTokensInBlock(block) > 2) {
        throw new Error('At most 2 color tokens per block');
      }
      return;
    case 'callout':
      if (typeof (content as { text?: unknown }).text !== 'string') throw new Error('Invalid callout content');
      const calloutColor = (content as { color_token?: string }).color_token;
      if (calloutColor !== undefined && !COLOR_TOKENS.has(calloutColor)) {
        throw new Error('Invalid callout color_token');
      }
      (content as { spans?: AiSpan[] }).spans = normalizeInlineSpans(
        String((content as { text?: string }).text || ''),
        ((content as { spans?: AiSpan[] }).spans || [])
      );
      if (countDistinctColorTokensInBlock(block) > 2) {
        throw new Error('At most 2 color tokens per block');
      }
      return;
    case 'bullet_list':
      if (!Array.isArray((content as { items?: unknown }).items)) throw new Error('Invalid bullet_list content');
      return;
    case 'numbered_list':
      if (!Array.isArray((content as { items?: unknown }).items)) throw new Error('Invalid numbered_list content');
      return;
    case 'code':
      if (typeof (content as { code?: unknown }).code !== 'string') throw new Error('Invalid code content');
      return;
    case 'divider':
      return;
    case 'table':
      if (!Array.isArray((content as { rows?: unknown }).rows)) throw new Error('Invalid table content');
      if ((content as { columns?: unknown }).columns !== undefined && !Array.isArray((content as { columns?: unknown }).columns)) {
        throw new Error('Invalid table content');
      }
      return;
    default:
      throw new Error('Unsupported block type');
  }
}

function normalizeEducationalBlocksForInsert(blocks: AiBlock[]): AiBlock[] {
  const COLORED_TYPES = new Set(['heading', 'paragraph', 'callout']);
  let consecutiveColored = 0;
  return blocks.map((block) => {
    const raw = (block.content || {}) as Record<string, unknown>;
    const content = { ...raw } as Record<string, unknown>;
    const isColored = COLORED_TYPES.has(block.type) && !!(content as { color_token?: unknown }).color_token;
    if (isColored) {
      consecutiveColored++;
      if (consecutiveColored > 3) {
        if ('color_token' in content) {
          delete (content as { color_token?: unknown }).color_token;
        }
        consecutiveColored = 0;
      }
    } else {
      consecutiveColored = 0;
    }

    if (block.type === 'bullet_list') {
      return {
        type: 'list',
        content: { ordered: false, items: (raw as { items?: string[] }).items || [], nested: false }
      };
    }
    if (block.type === 'numbered_list') {
      return {
        type: 'list',
        content: { ordered: true, items: (raw as { items?: string[] }).items || [], nested: false }
      };
    }
    if ('_meta' in content) {
      delete (content as { _meta?: unknown })._meta;
    }
    return { type: block.type, content };
  });
}

function validateBlockContent(block: AiBlock) {
  const content = (block.content || {}) as Record<string, unknown>;
  switch (block.type) {
    case 'heading':
      if (typeof (content as { text?: unknown }).text !== 'string') throw new Error('Invalid heading content');
      if ((content as { level?: unknown }).level !== undefined && typeof (content as { level?: unknown }).level !== 'number') {
        throw new Error('Invalid heading level');
      }
      if ((content as { subtitle?: unknown }).subtitle !== undefined && (content as { subtitle?: unknown }).subtitle !== null && typeof (content as { subtitle?: unknown }).subtitle !== 'string') {
        throw new Error('Invalid heading subtitle');
      }
      if (Array.isArray((content as { spans?: unknown }).spans) || (content as { spans?: unknown }).spans != null) {
        (content as { spans?: AiSpan[] }).spans = normalizeInlineSpans(
          String((content as { text?: string }).text || ''),
          ((content as { spans?: AiSpan[] }).spans || [])
        );
      }
      return;
    case 'paragraph':
      if (typeof (content as { text?: unknown }).text !== 'string') throw new Error('Invalid paragraph content');
      if (Array.isArray((content as { spans?: unknown }).spans) || (content as { spans?: unknown }).spans != null) {
        (content as { spans?: AiSpan[] }).spans = normalizeInlineSpans(
          String((content as { text?: string }).text || ''),
          ((content as { spans?: AiSpan[] }).spans || [])
        );
      }
      return;
    case 'quote':
      if (typeof (content as { text?: unknown }).text !== 'string') throw new Error('Invalid quote content');
      return;
    case 'callout':
      if (typeof (content as { text?: unknown }).text !== 'string') throw new Error('Invalid callout content');
      if (Array.isArray((content as { spans?: unknown }).spans) || (content as { spans?: unknown }).spans != null) {
        (content as { spans?: AiSpan[] }).spans = normalizeInlineSpans(
          String((content as { text?: string }).text || ''),
          ((content as { spans?: AiSpan[] }).spans || [])
        );
      }
      return;
    case 'list':
      if (!Array.isArray((content as { items?: unknown }).items)) throw new Error('Invalid list content');
      if (typeof (content as { ordered?: unknown }).ordered !== 'boolean') {
        (content as { ordered?: boolean }).ordered = false;
      }
      if (typeof (content as { nested?: unknown }).nested !== 'boolean') {
        (content as { nested?: boolean }).nested = false;
      }
      return;
    case 'checklist':
      if (!Array.isArray((content as { items?: unknown }).items)) throw new Error('Invalid checklist content');
      (content as { items: ChecklistItem[] }).items = ((content as { items: ChecklistItem[] }).items || []).map((item) => ({
        text: String(item?.text || ''),
        checked: typeof item?.checked === 'boolean' ? item.checked : false
      }));
      return;
    case 'definitions':
      if (!Array.isArray((content as { items?: unknown }).items)) throw new Error('Invalid definitions content');
      return;
    case 'code':
      if (typeof (content as { code?: unknown }).code !== 'string') throw new Error('Invalid code content');
      return;
    case 'image':
      if (typeof (content as { url?: unknown }).url !== 'string') throw new Error('Invalid image content');
      return;
    case 'divider':
      return;
    case 'table':
      if (!Array.isArray((content as { rows?: unknown }).rows)) throw new Error('Invalid table content');
      if ((content as { columns?: unknown }).columns !== undefined && !Array.isArray((content as { columns?: unknown }).columns)) {
        throw new Error('Invalid table content');
      }
      return;
    case 'timeline':
      if (!Array.isArray((content as { items?: unknown }).items)) throw new Error('Invalid timeline content');
      return;
    case 'steps':
      if (!Array.isArray((content as { steps?: unknown }).steps)) throw new Error('Invalid steps content');
      return;
    case 'quiz':
      if (Array.isArray((content as { questions?: unknown }).questions)) {
        return;
      }
      if (typeof (content as { question?: unknown }).question !== 'string' || !Array.isArray((content as { options?: unknown }).options)) {
        throw new Error('Invalid quiz content');
      }
      return;
    case 'flashcard':
      if (typeof (content as { front?: unknown }).front === 'string' && typeof (content as { back?: unknown }).back === 'string') {
        return;
      }
      throw new Error('Invalid flashcard content');
    case 'flashcard_deck':
      if (!Array.isArray((content as { cards?: unknown }).cards)) {
        if (Array.isArray((content as { items?: unknown }).items)) {
          (content as { cards?: unknown }).cards = (content as { items?: unknown }).items;
        } else {
          throw new Error('Invalid flashcard deck content');
        }
      }
      return;
    case 'faq':
      if (!Array.isArray((content as { items?: unknown }).items)) throw new Error('Invalid faq content');
      return;
    case 'summary':
      if (typeof (content as { text?: unknown }).text !== 'string') throw new Error('Invalid summary content');
      return;
    case 'takeaways':
      if (!Array.isArray((content as { items?: unknown }).items)) throw new Error('Invalid takeaways content');
      return;
    case 'mermaid':
      if (typeof (content as { code?: unknown }).code !== 'string') throw new Error('Invalid mermaid content');
      return;
    case 'graph':
      if (!Array.isArray((content as { nodes?: unknown }).nodes) || !Array.isArray((content as { edges?: unknown }).edges)) {
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
  const language = body.language_code || 'en';
  const mode = body.mode === 'standard' ? 'standard' : 'educational';
  const selectedContentTypes = Array.isArray(body.selected_content_types)
    ? body.selected_content_types
    : [];
  const usePageContext = !!body.use_page_context;
  const sources = Array.isArray(body.sources) ? body.sources : [];
  const userPreferences = (body.user_preferences || '').trim();

  if (!pageId || !language) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  if (sources.length === 0) {
    return NextResponse.json({ error: 'Missing sources' }, { status: 400 });
  }

  for (const source of sources) {
    if (!source || typeof source !== 'object') {
      return NextResponse.json({ error: 'Invalid source' }, { status: 400 });
    }
    if (source.type === 'file' && (!source.content || source.content.trim().length === 0)) {
      return NextResponse.json({ error: 'Empty file source' }, { status: 400 });
    }
  }

  const page = await getPageOwner(pageId);
  if (!page || page.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let manualBlocks: StoredBlock[] = [];
  let manualContent = '';
  let attachmentContent = '';

  const { data: blocksData, error: blocksError } = await supabaseAdmin
    .from('blocks')
    .select('logical_id, type, content, position, version, is_deleted')
    .eq('page_id', pageId)
    .order('version', { ascending: false });

  if (blocksError) {
    return NextResponse.json({ error: blocksError.message }, { status: 500 });
  }

  const rows = (blocksData as unknown as StoredBlock[] | null) || [];
  const latestMap = new Map<string, StoredBlock>();
  rows.forEach((block) => {
    if (!latestMap.has(block.logical_id)) {
      latestMap.set(block.logical_id, block);
    }
  });

  manualBlocks = Array.from(latestMap.values())
    .filter((block) => !block.is_deleted)
    .sort((a, b) => a.position - b.position);

  if (usePageContext) {
    manualContent = normalizeText(
      manualBlocks
        .map((block) => {
          const content = (block.content || {}) as Record<string, unknown>;
          switch (block.type) {
            case 'heading':
            case 'paragraph':
            case 'callout':
              return String((content as { text?: unknown }).text || '');
            case 'code':
              return String((content as { code?: unknown }).code || '');
            case 'image':
              return String((content as { url?: unknown }).url || '');
            case 'attachment':
              return String((content as { display_name?: unknown }).display_name || '');
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

    attachmentContent = normalizeText(
      (attachmentsData || [])
        .map((item) => item.parsed_text || '')
        .filter(Boolean)
        .join(' ')
    );
  }

  const combinedManual = truncateText(manualContent, MAX_CONTEXT_CHARS);
  const combinedAttachments = truncateText(attachmentContent, MAX_CONTEXT_CHARS);
  const sourcesContent = truncateText(
    normalizeText(
      sources.map((source) => source.content || '').filter(Boolean).join(' ')
    ),
    MAX_CONTEXT_CHARS
  );

  const { systemPrompt, userPrompt } =
    mode === 'educational'
      ? buildEducationalPrompt({
          pageTitle: page.title || '',
          manualContent: combinedManual,
          attachmentContent: combinedAttachments,
          language,
          sourcesContent
        })
      : buildPrompt({
          pageTitle: page.title || '',
          manualContent: combinedManual,
          attachmentContent: combinedAttachments,
          language,
          selectedContentTypes,
          userPreferences,
          sourcesContent
        });

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OpenAI key missing' }, { status: 500 });
  }

  try {
    console.log('[dashboard] ai generate start', { userId: user.id, pageId });
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

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data?.choices?.[0]?.message?.content || '';
    const parsed = parseJsonResponse(content);
    const isEducational = mode === 'educational';
    const payload = validateBlocksPayload(
      Array.isArray(parsed) ? { blocks: parsed as AiBlock[] } : parsed,
      isEducational
    );

    payload.blocks = payload.blocks.map((block) => normalizeColorContract(block));

    if (isEducational) {
      payload.blocks.forEach((block) => validateEducationalBlockContent(block));
    } else {
      payload.blocks.forEach((block) => validateBlockContent(block));
    }

    const blocksToInsert = isEducational
      ? normalizeEducationalBlocksForInsert(payload.blocks)
      : payload.blocks;

    const currentMaxPosition =
      manualBlocks.length > 0 ? manualBlocks[manualBlocks.length - 1].position : 0;
    const basePosition = currentMaxPosition;
    const now = new Date().toISOString();

    const rows = blocksToInsert.map((block, index: number) => {
      const position = basePosition + 1 + index * 0.01;
      const raw = (block.content || {}) as Record<string, unknown>;
      const content: Record<string, unknown> = {
        ...raw,
        _meta: { source: 'ai' }
      };
      const resolvedToken =
        (raw as { color_token?: unknown }).color_token ??
        (raw as { colorToken?: unknown }).colorToken ??
        (block.style as { color_token?: unknown } | undefined)?.color_token ??
        (block.style as { colorToken?: unknown } | undefined)?.colorToken;
      if (resolvedToken != null) {
        (content as { color_token?: unknown }).color_token = resolvedToken;
        delete (content as { colorToken?: unknown }).colorToken;
      }
      return {
        page_id: pageId,
        logical_id: crypto.randomUUID(),
        type: block.type,
        content,
        position,
        version: 1,
        created_at: now,
        created_by: user.id,
        is_deleted: false
      };
    });

    const { error: insertError } = await supabaseAdmin.from('blocks').insert(rows);
    if (insertError) {
      console.log('[dashboard] ai generate insert failed', { userId: user.id, pageId, error: insertError.message });
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const isFirstAi = await markPageAiUsage({ userId: user.id, pageId: pageId, firstAiAt: now });
    await incrementUserStats({
      userId: user.id,
      aiCallsDelta: 1,
      pagesWithAiDelta: isFirstAi ? 1 : 0,
      lastActivityAt: now
    });
    await incrementDailyActivity({ userId: user.id, aiCallsDelta: 1 });
    await touchRecentPage({ userId: user.id, pageId: pageId, accessedAt: now });

    console.log('[dashboard] ai generate stats updated', { userId: user.id, pageId, isFirstAi });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('AI generation failed:', error);
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
  }
}
