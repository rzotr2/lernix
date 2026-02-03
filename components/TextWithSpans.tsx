'use client';

import React from 'react';

export type InlineSpan = {
  start: number;
  end: number;
  emphasis?: 'soft' | 'strong';
  color_token?: string;
};

const COLOR_TOKENS = new Set([
  'neutral-glass',
  'accent-soft',
  'accent-focus',
  'accent-muted',
  'warning-soft',
  'success-soft'
]);

function spanClasses(span: InlineSpan): string {
  const parts: string[] = [];
  if (span.emphasis === 'strong') parts.push('font-semibold');
  if (span.emphasis === 'soft') parts.push('italic text-muted');
  if (span.color_token && COLOR_TOKENS.has(span.color_token)) {
    parts.push(`token-${span.color_token}`);
  }
  return parts.join(' ');
}

type TextWithSpansProps = {
  text: string;
  spans?: InlineSpan[] | null;
  className?: string;
};

function isWordChar(c: string): boolean {
  return /\w/.test(c) || /[\u0400-\u04FF]/.test(c);
}

function snapSpanToWordBoundaries(
  text: string,
  start: number,
  end: number
): { start: number; end: number } {
  const len = text.length;
  let s = Math.max(0, start);
  let e = Math.min(end, len);
  while (s > 0 && isWordChar(text[s - 1])) s--;
  while (e < len && isWordChar(text[e])) e++;
  return { start: s, end: e };
}

/**
 * Renders text with optional inline spans for emphasis and color tokens.
 * Span boundaries are snapped to word boundaries so we never split mid-word.
 * Spans are processed in order; overlapping regions use the first span.
 */
export function TextWithSpans({ text, spans, className = '' }: TextWithSpansProps) {
  if (!text) return null;
  if (!Array.isArray(spans) || spans.length === 0) {
    return <span className={className}>{text}</span>;
  }

  const len = text.length;
  const sorted = [...spans]
    .filter((s) => s.start < s.end && s.start >= 0 && s.end <= len)
    .sort((a, b) => a.start - b.start);

  let lastEnd = 0;
  const nodes: React.ReactNode[] = [];

  for (const span of sorted) {
    let start = Math.max(span.start, lastEnd);
    let end = Math.min(span.end, len);
    if (start >= end) continue;
    const snapped = snapSpanToWordBoundaries(text, start, end);
    start = Math.max(snapped.start, lastEnd);
    end = Math.min(snapped.end, len);
    if (start >= end) continue;
    if (start >= end) continue;

    if (start > lastEnd) {
      nodes.push(
        <React.Fragment key={`plain-${lastEnd}`}>
          {text.slice(lastEnd, start)}
        </React.Fragment>
      );
    }

    const segment = text.slice(start, end);
    const cls = spanClasses(span);
    nodes.push(
      <span key={`span-${start}-${end}`} className={cls || undefined}>
        {segment}
      </span>
    );
    lastEnd = end;
  }

  if (lastEnd < len) {
    nodes.push(
      <React.Fragment key={`plain-${lastEnd}`}>{text.slice(lastEnd)}</React.Fragment>
    );
  }

  return <span className={className}>{nodes}</span>;
}
