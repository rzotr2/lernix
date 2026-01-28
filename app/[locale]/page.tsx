'use client';

import { useTranslations } from 'next-intl';

export default function WorkspaceEmptyState() {
  const t = useTranslations();

  return (
    <div className="h-full flex items-center justify-center px-6">
      <div className="text-center max-w-md text-foreground">
        <h1 className="text-2xl font-semibold text-foreground">
          {t('emptyState.title')}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {t('emptyState.subtitle')}
        </p>
      </div>
    </div>
  );
}
