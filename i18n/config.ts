export const locales = ['en', 'de', 'uk'] as const;
export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = 'en';

export const localeLabels: Record<AppLocale, string> = {
  en: 'English',
  de: 'Deutsch',
  uk: 'Українська'
};
