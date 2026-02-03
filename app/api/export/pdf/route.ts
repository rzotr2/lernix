import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { chromium } from 'playwright';
import { supabaseAdmin } from '@/utils/supabase-admin';

export const runtime = 'nodejs';

type ExportPayload = {
  page_id?: string;
  locale?: string;
};

type PageRecord = {
  id: string;
  title: string | null;
  owner_id: string;
};

type BlockRecord = {
  id: string;
  logical_id: string;
  type: string;
  content: Record<string, unknown>;
  position: number;
  version: number;
  is_deleted?: boolean;
};

type AttachmentRecord = {
  id: string;
  filename: string;
};

type GraphNode = { id?: string; label?: string };
type GraphEdge = { from?: string; to?: string; label?: string };
type Flashcard = { front?: string; back?: string; explanation?: string };
type QuizQuestion = {
  question?: string;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  answer?: string;
};
type TimelineItem = { title?: string; description?: string; date?: string; order?: string };
type Span = { start: number; end: number; emphasis?: string; color_token?: string };

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

async function getPage(pageId: string) {
  const { data } = await supabaseAdmin
    .from('pages')
    .select('id,title,owner_id')
    .eq('id', pageId)
    .maybeSingle();

  return (data as PageRecord) || null;
}

async function getBlocks(pageId: string) {
  const { data, error } = await supabaseAdmin
    .from('blocks')
    .select('id, logical_id, type, content, position, version, is_deleted')
    .eq('page_id', pageId)
    .order('version', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const latestMap = new Map<string, BlockRecord>();
  data?.forEach((block) => {
    if (!latestMap.has(block.logical_id)) {
      latestMap.set(block.logical_id, block as BlockRecord);
    }
  });

  return Array.from(latestMap.values())
    .filter((block) => !block.is_deleted)
    .sort((a, b) => a.position - b.position);
}

async function getAttachments(pageId: string) {
  const { data, error } = await supabaseAdmin
    .from('attachments')
    .select('id, filename')
    .eq('page_id', pageId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as AttachmentRecord[];
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(value: string) {
  return escapeHtml(value);
}

const PDF_COLOR_TOKENS: Record<string, { color: string }> = {
  'neutral-glass': { color: '#475569' },
  'accent-soft': { color: '#0e7490' },
  'accent-focus': { color: '#0369a1' },
  'accent-muted': { color: '#64748b' },
  'warning-soft': { color: '#b45309' },
  'success-soft': { color: '#15803d' }
};

const PDF_CALLOUT_TOKENS: Record<string, { border: string; background: string }> = {
  'neutral-glass': { border: '1px solid #e2e8f0', background: 'rgba(15,23,42,0.04)' },
  'accent-soft': { border: '1px solid rgba(56,189,248,0.35)', background: 'rgba(56,189,248,0.12)' },
  'accent-focus': { border: '1px solid rgba(56,189,248,0.5)', background: 'rgba(56,189,248,0.18)' },
  'accent-muted': { border: '1px solid #cbd5e1', background: 'rgba(100,116,139,0.1)' },
  'warning-soft': { border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.1)' },
  'success-soft': { border: '1px solid rgba(34,197,94,0.4)', background: 'rgba(34,197,94,0.1)' }
};

function renderTextWithSpans(text: string, spans?: Array<{ start: number; end: number; emphasis?: string; color_token?: string }>): string {
  if (!text) return '';
  if (!Array.isArray(spans) || spans.length === 0) {
    return escapeHtml(text);
  }
  const len = text.length;
  const sorted = spans
    .filter((s) => s.start < s.end && s.start >= 0 && s.end <= len)
    .sort((a, b) => a.start - b.start);

  let lastEnd = 0;
  const parts: string[] = [];

  for (const span of sorted) {
    const start = Math.max(span.start, lastEnd);
    const end = Math.min(span.end, len);
    if (start >= end) continue;

    if (start > lastEnd) {
      parts.push(escapeHtml(text.slice(lastEnd, start)));
    }

    const segment = text.slice(start, end);
    const styles: string[] = [];
    if (span.emphasis === 'strong') styles.push('font-weight:600');
    if (span.emphasis === 'soft') styles.push('font-style:italic;color:#64748b');
    if (span.color_token && PDF_COLOR_TOKENS[span.color_token]) {
      styles.push(`color:${PDF_COLOR_TOKENS[span.color_token].color}`);
    }
    const styleAttr = styles.length ? ` style="${styles.join(';')}"` : '';
    parts.push(`<span${styleAttr}>${escapeHtml(segment)}</span>`);
    lastEnd = end;
  }

  if (lastEnd < len) {
    parts.push(escapeHtml(text.slice(lastEnd)));
  }

  return parts.join('');
}

function renderGraphSvg(nodes: GraphNode[] = [], edges: GraphEdge[] = []) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const safeEdges = Array.isArray(edges) ? edges : [];
  const radius = 140;
  const centerX = 180;
  const centerY = 120;
  const angleStep = (Math.PI * 2) / Math.max(safeNodes.length, 1);
  const positions = new Map<string, { x: number; y: number }>();

  safeNodes.forEach((node, idx) => {
    const angle = idx * angleStep;
    const nodeId = node.id || String(idx);
    positions.set(nodeId, {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    });
  });

  const edgeSvg = safeEdges
    .map((edge, idx) => {
      const from = positions.get(edge.from || '');
      const to = positions.get(edge.to || '');
      if (!from || !to) return '';
      const label = edge.label
        ? `<text x="${(from.x + to.x) / 2}" y="${(from.y + to.y) / 2}" fill="#64748B" font-size="10" text-anchor="middle">${escapeHtml(edge.label)}</text>`
        : '';
      return `<g key="edge-${idx}">
        <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="#94A3B8" stroke-width="1" marker-end="url(#arrow)" />
        ${label}
      </g>`;
    })
    .join('');

  const nodeSvg = safeNodes
    .map((node) => {
      const pos = positions.get(node.id || '');
      if (!pos) return '';
      return `<g>
        <circle cx="${pos.x}" cy="${pos.y}" r="18" fill="#F8FAFC" stroke="#38BDF8" />
        <text x="${pos.x}" y="${pos.y + 4}" fill="#0B0F19" font-size="10" text-anchor="middle">${escapeHtml(node.label || node.id || '')}</text>
      </g>`;
    })
    .join('');

  return `
    <svg width="360" height="240" viewBox="0 0 360 240" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="#94A3B8" />
        </marker>
      </defs>
      ${edgeSvg}
      ${nodeSvg}
    </svg>
  `;
}

function renderFlashcards(content: Record<string, unknown>) {
  const cards = Array.isArray((content as { cards?: unknown }).cards)
    ? ((content as { cards: Flashcard[] }).cards || [])
    : Array.isArray((content as { items?: unknown }).items)
      ? ((content as { items: Flashcard[] }).items || [])
      : [
          {
            front: (content as { front?: string }).front,
            back: (content as { back?: string }).back,
            explanation: (content as { explanation?: string }).explanation
          }
        ];

  const rendered = cards
    .filter((card) => card.front && (card.back || card.explanation))
    .map((card) => {
      const answer = card.back || card.explanation || '';
      return `
        <div class="flashcard">
          <div class="flashcard-q"><strong>Q:</strong> ${escapeHtml(String(card.front))}</div>
          <div class="flashcard-a"><strong>A:</strong> ${escapeHtml(String(answer))}</div>
        </div>
      `;
    })
    .join('');

  return rendered || `<div class="muted">Flashcard content unavailable.</div>`;
}

function renderQuiz(content: Record<string, unknown>) {
  const questions = Array.isArray((content as { questions?: unknown }).questions)
    ? ((content as { questions: QuizQuestion[] }).questions || [])
    : [
        {
          question: (content as { question?: string }).question,
          options: (content as { options?: string[] }).options,
          correctIndex: (content as { correctIndex?: number }).correctIndex,
          explanation: (content as { explanation?: string }).explanation,
          answer: (content as { answer?: string }).answer
        }
      ];

  const rendered = questions
    .filter((q) => q.question && Array.isArray(q.options) && q.options.length > 0)
    .map((q) => {
      const candidateIndex =
        q.correctIndex ??
        (q.answer && q.options ? q.options.findIndex((opt: string) => opt === q.answer) : undefined);
      const correctIndex = typeof candidateIndex === 'number' && candidateIndex >= 0 ? candidateIndex : undefined;
      const options = q.options || [];
      const optionsHtml = options
        .map((opt: string, optIndex: number) => {
          const mark = correctIndex === optIndex ? ' <span class="quiz-correct">(correct)</span>' : '';
          return `<li>${escapeHtml(opt)}${mark}</li>`;
        })
        .join('');

      const correctAnswerText =
        correctIndex !== undefined ? options[correctIndex] : null;

      return `
        <div class="quiz-block">
          <div class="quiz-question">${escapeHtml(String(q.question))}</div>
          <ul class="quiz-options">${optionsHtml}</ul>
          ${correctAnswerText ? `<div class="quiz-answer"><strong>Correct answer:</strong> ${escapeHtml(String(correctAnswerText))}</div>` : ''}
          ${q.explanation ? `<div class="quiz-explanation"><strong>Explanation:</strong> ${escapeHtml(String(q.explanation))}</div>` : ''}
        </div>
      `;
    })
    .join('');

  return rendered || `<div class="muted">Quiz content unavailable.</div>`;
}

function renderTimeline(content: Record<string, unknown>) {
  const items = Array.isArray((content as { items?: unknown }).items)
    ? ((content as { items: TimelineItem[] }).items || [])
    : [];
  if (items.length === 0) {
    return `<div class="muted">Timeline content unavailable.</div>`;
  }

  const rendered = items
    .map((item) => {
      const date = item.date ?? item.order ?? '';
      return `
        <div class="timeline-item">
          <div class="timeline-title">${escapeHtml(String(item.title || 'Timeline item'))}</div>
          ${date ? `<div class="timeline-date">${escapeHtml(String(date))}</div>` : ''}
          ${item.description ? `<div class="timeline-desc">${escapeHtml(String(item.description))}</div>` : ''}
        </div>
      `;
    })
    .join('');

  return `<div class="timeline">${rendered}</div>`;
}

function renderTable(content: Record<string, unknown>) {
  const columns = Array.isArray((content as { columns?: unknown }).columns)
    ? ((content as { columns: string[] }).columns || [])
    : [];
  const rows = Array.isArray((content as { rows?: unknown }).rows)
    ? ((content as { rows: string[][] }).rows || [])
    : [];
  if (rows.length === 0) {
    return `<div class="muted">Table content unavailable.</div>`;
  }

  const head = columns.length
    ? `<tr>${columns.map((col: string) => `<th>${escapeHtml(col)}</th>`).join('')}</tr>`
    : '';
  const body = rows
    .map((row: string[]) => `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell))}</td>`).join('')}</tr>`)
    .join('');

  const caption = (content as { caption?: string }).caption
    ? `<div class="table-caption">${escapeHtml(String((content as { caption?: string }).caption))}</div>`
    : '';
  return `
    ${caption}
    <table class="table">
      ${head ? `<thead>${head}</thead>` : ''}
      <tbody>${body}</tbody>
    </table>
  `;
}

function renderBlock(block: BlockRecord, attachmentsMap: Map<string, AttachmentRecord>) {
  const content = block.content || {};
  switch (block.type) {
    case 'heading': {
      const level = Math.min(Math.max(Number(content.level) || 1, 1), 3);
      const tag = `h${level}`;
      const text = String(content.text || '');
      const spans = Array.isArray(content.spans) ? (content.spans as Span[]) : [];
      const hasSpans = spans.length > 0;
      const inner = hasSpans ? renderTextWithSpans(text, spans) : escapeHtml(text);
      const subtitle = content.subtitle
        ? `<div class="subtitle">${escapeHtml(String(content.subtitle))}</div>`
        : '';
      return `<${tag}>${inner}</${tag}>${subtitle}`;
    }
    case 'paragraph': {
      const text = String(content.text || '');
      const spans = Array.isArray(content.spans) ? (content.spans as Span[]) : [];
      const hasSpans = spans.length > 0;
      const inner = hasSpans ? renderTextWithSpans(text, spans) : escapeHtml(text);
      return `<p>${inner}</p>`;
    }
    case 'quote': {
      const text = escapeHtml(String(content.text || ''));
      const author = content.author ? escapeHtml(String(content.author)) : '';
      const source = content.source ? escapeHtml(String(content.source)) : '';
      const meta = author || source ? `<div class="muted">${[author, source].filter(Boolean).join(' • ')}</div>` : '';
      return `<blockquote class="quote">${text}${meta}</blockquote>`;
    }
    case 'callout': {
      const calloutText = String(content.text || '');
      const spans = Array.isArray(content.spans) ? (content.spans as Span[]) : [];
      const hasSpans = spans.length > 0;
      const inner = hasSpans ? renderTextWithSpans(calloutText, spans) : escapeHtml(calloutText);
      const tokenKey =
        typeof content.color_token === 'string' ? content.color_token : undefined;
      const colorToken = tokenKey
        ? PDF_CALLOUT_TOKENS[tokenKey as keyof typeof PDF_CALLOUT_TOKENS]
        : undefined;
      const calloutStyle = colorToken
        ? ` style="border:${colorToken.border};background:${colorToken.background};border-radius:8px;padding:12px;"`
        : ' class="callout"';
      return `<div${calloutStyle}>${inner}</div>`;
    }
    case 'list': {
      const items = Array.isArray(content.items) ? content.items : [];
      const tag = content.ordered ? 'ol' : 'ul';
      return items.length
        ? `<${tag} class="list">${items.map((item) => `<li>${escapeHtml(String(item))}</li>`).join('')}</${tag}>`
        : `<div class="muted">List content unavailable.</div>`;
    }
    case 'checklist': {
      const items = Array.isArray((content as { items?: unknown }).items)
        ? ((content as { items: { text?: string; checked?: boolean }[] }).items || [])
        : [];
      if (!items.length) return `<div class="muted">Checklist content unavailable.</div>`;
      const rendered = items
        .map((item) => {
          const checked = item?.checked ? '☑' : '☐';
          return `<li>${checked} ${escapeHtml(String(item?.text || ''))}</li>`;
        })
        .join('');
      return `<ul class="list">${rendered}</ul>`;
    }
    case 'definitions': {
      const items = Array.isArray((content as { items?: unknown }).items)
        ? ((content as { items: { term?: string; definition?: string }[] }).items || [])
        : [];
      if (!items.length) return `<div class="muted">Definitions content unavailable.</div>`;
      const rendered = items
        .map((item) => `<dt>${escapeHtml(String(item?.term || ''))}</dt><dd>${escapeHtml(String(item?.definition || ''))}</dd>`)
        .join('');
      return `<dl class="definitions">${rendered}</dl>`;
    }
    case 'code':
      return `<pre><code>${escapeHtml(String(content.code || ''))}</code></pre>`;
    case 'image': {
      const url = content.url ? String(content.url) : '';
      if (!url) return `<div class="muted">Image unavailable.</div>`;
      const alt = content.alt ? String(content.alt) : 'Image';
      const caption = content.caption ? `<div class="caption">${escapeHtml(String(content.caption))}</div>` : '';
      return `<img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}" />${caption}`;
    }
    case 'divider': {
      const label = content.label ? `<span class="divider-label">${escapeHtml(String(content.label))}</span>` : '';
      return `<div class="divider"><hr />${label}</div>`;
    }
    case 'table':
      return renderTable(content);
    case 'flashcard':
      return renderFlashcards(content);
    case 'flashcard_deck':
      return renderFlashcards(content);
    case 'faq': {
      const items = Array.isArray((content as { items?: unknown }).items)
        ? ((content as { items: { question?: string; answer?: string }[] }).items || [])
        : [];
      if (!items.length) return `<div class="muted">FAQ content unavailable.</div>`;
      const rendered = items
        .map(
          (item) =>
            `<div class="faq-item"><div class="faq-q">${escapeHtml(String(item?.question || ''))}</div><div class="faq-a">${escapeHtml(String(item?.answer || ''))}</div></div>`
        )
        .join('');
      return `<div class="faq">${rendered}</div>`;
    }
    case 'summary':
      return `<div class="callout">${escapeHtml(String(content.text || ''))}</div>`;
    case 'takeaways': {
      const items = Array.isArray(content.items) ? content.items : [];
      if (!items.length) return `<div class="muted">Takeaways content unavailable.</div>`;
      const rendered = items.map((item: string) => `<li>★ ${escapeHtml(String(item))}</li>`).join('');
      return `<ul class="list">${rendered}</ul>`;
    }
    case 'quiz':
      return renderQuiz(content);
    case 'timeline':
      return renderTimeline(content);
    case 'steps': {
      const steps = Array.isArray((content as { steps?: unknown }).steps)
        ? ((content as { steps: { title?: string; description?: string }[] }).steps || [])
        : [];
      if (!steps.length) return `<div class="muted">Steps content unavailable.</div>`;
      const rendered = steps
        .map(
          (step) =>
            `<li><strong>${escapeHtml(String(step?.title || ''))}</strong><div>${escapeHtml(String(step?.description || ''))}</div></li>`
        )
        .join('');
      return `<ol class="list">${rendered}</ol>`;
    }
    case 'mermaid': {
      const code = content.code ? String(content.code) : '';
      if (!code) return `<div class="muted">Diagram content unavailable.</div>`;
      return `<div class="mermaid" data-mermaid="true">${escapeHtml(code)}</div>`;
    }
    case 'graph': {
      const nodes = Array.isArray((content as { nodes?: unknown }).nodes)
        ? ((content as { nodes: GraphNode[] }).nodes || [])
        : [];
      const edges = Array.isArray((content as { edges?: unknown }).edges)
        ? ((content as { edges: GraphEdge[] }).edges || [])
        : [];
      const svg = renderGraphSvg(nodes, edges);
      return `<div class="graph">${svg}</div>`;
    }
    case 'attachment': {
      const attachmentId = content.attachment_id ? String(content.attachment_id) : '';
      const attachment = attachmentId ? attachmentsMap.get(attachmentId) : null;
      const filename = attachment?.filename || content.display_name || 'Attachment';
      return `<div class="attachment">${escapeHtml(String(filename))} — Attachment (not included)</div>`;
    }
    default:
      return `<div class="muted">Unsupported block type.</div>`;
  }
}

function renderHtml(pageTitle: string, blocks: BlockRecord[], attachments: AttachmentRecord[]) {
  const attachmentsMap = new Map<string, AttachmentRecord>(
    attachments.map((item) => [item.id, item])
  );
  const blockHtml = blocks
    .map((block) => `<section class="block">${renderBlock(block, attachmentsMap)}</section>`)
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(pageTitle)}</title>
        <style>
          @page { margin: 24px; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
            background: #ffffff;
            color: #0b0f19;
            line-height: 1.6;
          }
          h1, h2, h3 { margin: 0 0 8px; }
          h1 { font-size: 28px; }
          h2 { font-size: 22px; }
          h3 { font-size: 18px; }
          .subtitle { margin: 0 0 12px; color: #475569; font-size: 13px; }
          p { margin: 0 0 12px; }
          .container { padding: 0; }
          .title { font-size: 32px; font-weight: 700; margin-bottom: 20px; }
          .block {
            margin-bottom: 18px;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .callout {
            border: 1px solid #e2e8f0;
            background: #f8fafc;
            padding: 12px;
            border-radius: 8px;
          }
          .quote {
            border-left: 3px solid #cbd5f5;
            padding: 8px 12px;
            font-style: italic;
            color: #111827;
          }
          pre {
            background: #f1f5f9;
            padding: 12px;
            border-radius: 8px;
            white-space: pre-wrap;
            word-break: break-word;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
            font-size: 12px;
          }
          img { max-width: 100%; height: auto; border-radius: 8px; }
          .caption { font-size: 11px; color: #64748b; margin-top: 6px; }
          .table { width: 100%; border-collapse: collapse; }
          .table th, .table td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
          .table-caption { font-size: 11px; color: #64748b; margin-bottom: 6px; }
          .flashcard { border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; margin-bottom: 8px; }
          .flashcard-q, .flashcard-a { margin-bottom: 6px; }
          .quiz-block { border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; margin-bottom: 12px; }
          .quiz-question { font-weight: 600; margin-bottom: 8px; }
          .quiz-options { margin: 0 0 8px 18px; padding: 0; }
          .quiz-options li { margin: 2px 0; }
          .quiz-correct { color: #16a34a; font-weight: 600; }
          .quiz-answer, .quiz-explanation { margin-top: 6px; }
          .timeline-item { border-left: 2px solid #e2e8f0; padding-left: 10px; margin-bottom: 10px; }
          .timeline-title { font-weight: 600; }
          .timeline-date { color: #64748b; font-size: 12px; }
          .timeline-desc { margin-top: 4px; }
          .list { margin: 0 0 12px 18px; padding: 0; }
          .definitions dt { font-weight: 600; margin-top: 8px; }
          .definitions dd { margin: 0 0 8px 0; color: #475569; }
          .faq-item { border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px; margin-bottom: 8px; }
          .faq-q { font-weight: 600; margin-bottom: 4px; }
          .faq-a { color: #475569; }
          .divider { text-align: center; margin: 12px 0; position: relative; }
          .divider-label { font-size: 11px; color: #64748b; background: #ffffff; padding: 2px 8px; }
          .graph { padding: 8px 0; }
          .attachment { font-size: 13px; color: #475569; }
          .muted { color: #64748b; font-size: 13px; }
          hr { border: none; border-top: 1px solid #e2e8f0; margin: 16px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="title">${escapeHtml(pageTitle)}</div>
          ${blockHtml}
        </div>
      </body>
    </html>
  `;
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as ExportPayload;
    const pageId = body.page_id;

    if (!pageId) {
      return NextResponse.json({ error: 'Missing page_id' }, { status: 400 });
    }

    const page = await getPage(pageId);
    if (!page || page.owner_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [blocks, attachments] = await Promise.all([
      getBlocks(pageId),
      getAttachments(pageId)
    ]);

    const html = renderHtml(page.title || 'Untitled', blocks, attachments);
    const browser = await chromium.launch({ headless: true });
    const pageInstance = await browser.newPage();
    await pageInstance.setContent(html, { waitUntil: 'load' });

    const hasMermaid = await pageInstance.evaluate(
      () => !!document.querySelector('[data-mermaid]')
    );
    if (hasMermaid) {
      try {
        await pageInstance.addScriptTag({
          url: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js'
        });
        await pageInstance.evaluate(async () => {
          const mermaidLib = (window as Window & {
            mermaid?: {
              initialize: (options: { startOnLoad: boolean; theme: string }) => void;
              render: (id: string, code: string) => Promise<{ svg: string }>;
            };
          }).mermaid;
          if (!mermaidLib) return;
          mermaidLib.initialize({ startOnLoad: false, theme: 'base' });
          const nodes = Array.from(document.querySelectorAll('[data-mermaid]'));
          let index = 0;
          for (const node of nodes) {
            const code = node.textContent || '';
            try {
              const { svg } = await mermaidLib.render(`mermaid-export-${index++}`, code);
              node.innerHTML = svg;
            } catch {
              node.textContent = 'Diagram content unavailable.';
            }
          }
        });
      } catch (error) {
        console.error('Mermaid render failed:', error);
      }
    }

    const pdfBuffer = await pageInstance.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '24px', bottom: '24px', left: '24px', right: '24px' }
    });

    await browser.close();

    const filename = sanitizeFilename(page.title || 'page');
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}.pdf"`
      }
    });
  } catch (error) {
    console.error('PDF export failed:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
