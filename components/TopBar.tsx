'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { locales, defaultLocale } from '@/i18n/config';
import enMessages from '@/messages/en.json';
import deMessages from '@/messages/de.json';
import ukMessages from '@/messages/uk.json';
import LanguagePicker from '@/components/LanguagePicker';
import { useLayout } from '@/contexts/LayoutContext';

export default function TopBar() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { toggleSidebar } = useLayout();
  const [selectedLocale, setSelectedLocale] = useState(defaultLocale);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const messages = useMemo(() => {
    if (selectedLocale === 'de') return deMessages;
    if (selectedLocale === 'uk') return ukMessages;
    return enMessages;
  }, [selectedLocale]);

  useEffect(() => {
    const stored = window.localStorage.getItem('locale');
    const isValidStored = locales.includes(stored as (typeof locales)[number]);
    if (isValidStored) {
      setSelectedLocale(stored as (typeof locales)[number]);
      return;
    }

    const pathLocale = pathname.split('/')[1];
    if (locales.includes(pathLocale as (typeof locales)[number])) {
      setSelectedLocale(pathLocale as (typeof locales)[number]);
      window.localStorage.setItem('locale', pathLocale);
    }
  }, [pathname]);

  const handleLocaleChange = (nextLocale: string) => {
    setSelectedLocale(nextLocale);
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await signOut();
      setIsLoggingOut(false);
    } catch (error) {
      console.error('Logout failed:', error);
      alert('Failed to sign out. Please try again.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <header className="fixed left-0 right-0 top-0 z-40 h-16 bg-surface-light dark:bg-surface-dark border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto flex h-full items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Toggle sidebar"
            onClick={toggleSidebar}
            className="inline-flex items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 shadow-subtle hover:shadow-hover transition lg:hidden"
          >
            ☰
          </button>
          <Link
            href={`/${selectedLocale}/dashboard`}
            className="text-md sm:text-lg font-medium text-text dark:text-text-dark flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <span className="text-2xl">📄</span>
            <span className="font-sans">{messages.app.name}</span>
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href={`/${selectedLocale}/dashboard`}
            className="hidden sm:inline-flex px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-dark rounded-full transition-colors shadow-subtle hover:shadow-hover"
          >
            {messages.header.dashboard}
          </Link>

          <LanguagePicker
            currentLocale={selectedLocale}
            onLocaleChange={handleLocaleChange}
          />

          <button
            onClick={handleLogout}
            disabled={isLoggingOut || !user}
            className="px-4 py-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-700 rounded-full transition-colors disabled:opacity-50"
          >
            {isLoggingOut ? `${messages.header.signOut}...` : messages.header.signOut}
          </button>
        </div>
      </div>
    </header>
  );
} 