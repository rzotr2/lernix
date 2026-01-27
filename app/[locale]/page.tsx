'use client';

import { useTranslations } from 'next-intl';

export default function WorkspaceEmptyState() {
  const t = useTranslations();

  return (
    <div className="h-full flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
          {t('emptyState.title')}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {t('emptyState.subtitle')}
        </p>
      </div>
    </div>
  );
}
