import { NextIntlClientProvider } from 'next-intl';
import { notFound } from 'next/navigation';
import AppSidebar from '@/components/AppSidebar';
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
      <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] flex flex-col">
        <div className="flex flex-1 min-h-0">
          <AppSidebar />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </NextIntlClientProvider>
  );
}
