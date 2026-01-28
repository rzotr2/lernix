'use client';

import { useTranslations } from 'next-intl';

type TableBlockProps = {
  columns?: string[];
  rows?: string[][];
  caption?: string | null;
};

export default function TableBlock({ columns, rows, caption }: TableBlockProps) {
  const t = useTranslations();
  const hasColumns = Array.isArray(columns) && columns.length > 0;
  const hasRows = Array.isArray(rows) && rows.length > 0;

  if (!hasRows) {
    return (
      <div className="glass-surface rounded-md p-3 text-sm text-muted">
        {t('ai.blocks.table')}
      </div>
    );
  }

  return (
    <>
      <div className="glass-surface-strong rounded-2xl md:hidden">
        {caption ? (
          <div className="px-3 pt-3 text-xs uppercase tracking-[0.2em] text-muted">
            {caption}
          </div>
        ) : null}
        <div className="space-y-3 p-3">
          {rows.map((row, rowIndex) => (
            <div
              key={`row-pod-${rowIndex}`}
              className="overflow-hidden rounded-xl border border-[color:var(--border)] bg-white/5"
            >
              <div className="flex h-8 items-center justify-between border-b border-[color:var(--border)] bg-white/5 px-2">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">
                  {t('blocks.labels.row', { index: rowIndex + 1 })}
                </div>
              </div>
              <div className="space-y-3 p-3">
                {row.map((cell, cellIndex) => {
                  const label =
                    hasColumns && columns?.[cellIndex]
                      ? columns[cellIndex]
                      : t('blocks.labels.column', { index: cellIndex + 1 });
                  return (
                    <div key={`cell-pod-${rowIndex}-${cellIndex}`} className="space-y-1">
                      <div className="text-xs text-muted">{label}</div>
                      <div className="text-sm text-foreground">{cell}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-surface-strong overflow-x-auto rounded-2xl hidden md:block">
        {caption ? (
          <div className="px-4 pt-3 text-xs uppercase tracking-[0.2em] text-muted">
            {caption}
          </div>
        ) : null}
        <table className="min-w-full text-sm text-foreground">
          {hasColumns ? (
            <thead>
              <tr className="border-b border-[color:var(--border)]">
                {columns.map((column, idx) => (
                  <th
                    key={`${column}-${idx}`}
                    className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.2em] text-muted"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={`row-${rowIndex}`}
                className="border-b border-[color:var(--border)] last:border-b-0 hover:bg-white/30 transition"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={`cell-${rowIndex}-${cellIndex}`}
                    className="px-4 py-3 align-top text-sm text-foreground"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
