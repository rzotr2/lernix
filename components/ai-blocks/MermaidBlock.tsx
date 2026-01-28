'use client';

import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import mermaid from 'mermaid';

type MermaidBlockProps = {
  code?: string;
};

export default function MermaidBlock({ code }: MermaidBlockProps) {
  const t = useTranslations();
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const id = useId();

  useEffect(() => {
    const updateTheme = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    updateTheme();
    window.addEventListener('theme:change', updateTheme);
    return () => window.removeEventListener('theme:change', updateTheme);
  }, []);

  useEffect(() => {
    if (!code) return;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: isDark ? 'dark' : 'base'
    });

    let active = true;
    mermaid
      .render(`mermaid-${id}`, code)
      .then((result) => {
        if (!active) return;
        setSvg(result.svg);
        setError(false);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
      });

    return () => {
      active = false;
    };
  }, [code, id, isDark]);

  if (!code) {
    return (
      <div className="glass-surface rounded-md p-3 text-sm text-muted">
        {t('ai.blocks.mermaid')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-400">
        {t('ai.blocks.mermaidError')}
      </div>
    );
  }

  return (
    <div className="glass-surface rounded-md p-3 overflow-x-auto">
      <div
        className="min-w-[300px]"
        dangerouslySetInnerHTML={{ __html: svg || '' }}
      />
    </div>
  );
}
