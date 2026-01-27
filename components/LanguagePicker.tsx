'use client';

import { usePathname, useRouter } from 'next/navigation';
import { locales } from '@/i18n/config';

const languages = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'uk', label: 'Українська' }
] as const;

type LanguagePickerProps = {
  currentLocale: (typeof locales)[number];
  onLocaleChange?: (locale: (typeof locales)[number]) => void;
};

export default function LanguagePicker({
  currentLocale,
  onLocaleChange
}: LanguagePickerProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newLocale = event.target.value as (typeof locales)[number];
    const segments = pathname.split('/');
    segments[1] = newLocale;
    const nextPath = segments.join('/') || `/${newLocale}`;
    window.localStorage.setItem('locale', newLocale);
    onLocaleChange?.(newLocale);
    router.push(nextPath);
  };

  return (
    <div className="language-picker inline-flex items-center whitespace-nowrap">
      <form className="language-picker__form">
        <label htmlFor="language-picker-select" className="sr-only">
          Select your language
        </label>

        <div className="relative">
          <select
            id="language-picker-select"
            value={currentLocale}
            onChange={handleChange}
            className="appearance-none bg-surface-light dark:bg-surface-dark text-text dark:text-text-dark border border-gray-200 dark:border-gray-700 rounded-full px-6 pr-12 py-2 text-sm font-medium shadow-subtle hover:shadow-hover transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/40 cursor-pointer text-center w-24 sm:w-28 md:w-32 lg:w-36"
          >
            {languages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">
            ▾
          </span>
        </div>
      </form>
    </div>
  );
}
