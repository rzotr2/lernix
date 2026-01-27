'use client';

import { useTranslations } from 'next-intl';

export default function AppSidebar() {
  const t = useTranslations();

  return (
    <aside className="w-64 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-neutral-dark">
      <div className="h-full overflow-y-auto p-4">
        <div className="text-sm text-slate-500 dark:text-slate-400">
          {t('sidebar.placeholder')}
        </div>
      </div>
    </aside>
  );
}
