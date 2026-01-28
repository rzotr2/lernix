'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { LogOut, Moon, Sun } from 'lucide-react';
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
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

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

  useEffect(() => {
    const root = document.documentElement;
    setTheme(root.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  const handleToggleTheme = () => {
    const root = document.documentElement;
    const next = theme === 'dark' ? 'light' : 'dark';
    root.classList.toggle('dark', next === 'dark');
    window.localStorage.setItem('theme', next);
    setTheme(next);
    window.dispatchEvent(new Event('theme:change'));
  };

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
    <header className="fixed left-0 right-0 top-0 z-50 h-16 border-b border-[color:var(--border)] bg-[color:var(--surface-1)] backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Toggle sidebar"
            onClick={toggleSidebar}
            className="btn-ghost inline-flex items-center justify-center rounded-full border border-[color:var(--border)] px-3 py-2 text-sm text-foreground shadow-[0_0_20px_rgba(15,23,42,0.12)] transition hover:shadow-[0_0_20px_rgba(56,189,248,0.25)] lg:hidden"
          >
            ☰
          </button>
          <Link
            href={`/${selectedLocale}/dashboard`}
            className="group flex items-center gap-3 text-md font-semibold text-foreground transition active:scale-95"
          >
            <span className="relative flex h-7 w-7 items-center justify-center">
              <svg
                viewBox="0 0 48 48"
                aria-hidden="true"
                className="h-7 w-7 drop-shadow-[0_0_16px_rgba(99,102,241,0.6)]"
              >
                <defs>
                  <linearGradient id="orbitalGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#a855f7" />
                    <stop offset="100%" stopColor="#38bdf8" />
                  </linearGradient>
                </defs>
                <path
                  d="M10 36V12l12 14 12-14v24l-12-14-12 14z"
                  fill="url(#orbitalGradient)"
                />
              </svg>
            </span>
            <span className="bg-gradient-to-r from-slate-900 via-slate-700 to-slate-500 dark:from-white dark:via-slate-200 dark:to-slate-400 bg-clip-text font-sans text-transparent">
              {messages.app.name}
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href={`/${selectedLocale}/dashboard`}
            className="btn-primary hidden sm:inline-flex items-center rounded-full px-5 py-2 text-sm font-semibold transition hover:-translate-y-0.5"
          >
            {messages.header.dashboard}
          </Link>

          <div className="hidden lg:flex items-center gap-4">
            <LanguagePicker
              currentLocale={selectedLocale}
              onLocaleChange={handleLocaleChange}
            />

            <button
              type="button"
              onClick={handleToggleTheme}
              aria-label="Toggle theme"
              className="btn-ghost inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 backdrop-blur-md transition hover:shadow-[0_0_18px_rgba(56,189,248,0.3)]"
            >
              <motion.span
                key={theme}
                initial={{ rotate: -90, opacity: 0, scale: 0.8 }}
                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                exit={{ rotate: 90, opacity: 0, scale: 0.8 }}
                transition={{ type: 'spring', stiffness: 240, damping: 18 }}
              >
                {theme === 'dark' ? (
                  <Moon className="h-4 w-4 text-slate-200" strokeWidth={1.5} />
                ) : (
                  <Sun className="h-4 w-4 text-amber-500" strokeWidth={1.5} />
                )}
              </motion.span>
            </button>
          </div>

          <button
            onClick={handleLogout}
            disabled={isLoggingOut || !user}
            className="group relative inline-flex items-center gap-2 pb-1 text-sm font-medium text-muted transition hover:text-foreground disabled:opacity-50"
          >
            <LogOut strokeWidth={1.5} className="h-4 w-4" />
            <span className="drop-shadow-[0_0_10px_rgba(56,189,248,0.2)]">
              {isLoggingOut ? `${messages.header.signOut}...` : messages.header.signOut}
            </span>
            <span className="pointer-events-none absolute bottom-0 left-1/2 h-px w-0 -translate-x-1/2 bg-white/70 transition-all duration-200 group-hover:w-full" />
          </button>
        </div>
      </div>
    </header>
  );
} 