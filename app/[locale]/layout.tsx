import { NextIntlClientProvider } from 'next-intl';
import { notFound } from 'next/navigation';
import WorkspaceShell from '@/components/WorkspaceShell';
import { locales } from '@/i18n/config';

type LocaleLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({
  children,
  params
}: LocaleLayoutProps) {
  const { locale } = await params;
  if (!locales.includes(locale as (typeof locales)[number])) {
    notFound();
  }

  const messages = (await import(`../../messages/${locale}.json`)).default;

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <WorkspaceShell>{children}</WorkspaceShell>
    </NextIntlClientProvider>
  );
}
