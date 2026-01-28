'use client';

import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';

type TimelineItem = {
  title?: string;
  description?: string;
  date?: string | number;
  order?: string | number;
};

type TimelineBlockProps = {
  items?: TimelineItem[];
};

export default function TimelineBlock({ items }: TimelineBlockProps) {
  const t = useTranslations();

  if (!Array.isArray(items) || items.length === 0) {
    return (
      <div className="glass-surface rounded-md p-3 text-sm text-muted">
        {t('ai.blocks.timeline')}
      </div>
    );
  }

  return (
    <div className="glass-surface-strong rounded-2xl p-4 sm:p-5">
      <ol className="relative space-y-6">
        <div className="absolute left-3 top-2 h-[calc(100%-1rem)] w-px bg-gradient-to-b from-blue-500/40 via-violet-500/40 to-fuchsia-500/40" />
        {items.map((item, idx) => (
          <motion.li
            key={`${item.title || 'item'}-${idx}`}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.04 }}
            className="relative pl-10"
          >
            <div className="absolute left-1.5 top-1.5 h-4 w-4 rounded-full bg-gradient-to-br from-blue-500/70 to-fuchsia-500/60 shadow-[0_0_12px_rgba(99,102,241,0.4)] animate-pulse" />
            <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-3">
              <div className="text-sm font-semibold text-foreground">
                {item.title || t('ai.blocks.timelineItem')}
              </div>
              {item.date || item.order ? (
                <div className="text-xs text-muted">
                  {item.date ?? item.order}
                </div>
              ) : null}
              {item.description ? (
                <p className="mt-2 text-sm text-muted">
                  {item.description}
                </p>
              ) : null}
            </div>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
