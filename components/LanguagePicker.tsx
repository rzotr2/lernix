'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { locales } from '@/i18n/config';

const languages = [
  { code: 'en', label: '🇺🇸', name: 'English' },
  { code: 'de', label: '🇩🇪', name: 'Deutsch' },
  { code: 'uk', label: '🇺🇦', name: 'Українська' }
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
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const handleChange = (newLocale: (typeof locales)[number]) => {
    const segments = pathname.split('/');
    segments[1] = newLocale;
    const nextPath = segments.join('/') || `/${newLocale}`;
    window.localStorage.setItem('locale', newLocale);
    onLocaleChange?.(newLocale);
    router.push(nextPath);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentLanguage =
    languages.find((lang) => lang.code === currentLocale) || languages[0];

  return (
    <div className="relative inline-flex items-center whitespace-nowrap">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Language: ${currentLanguage.name}`}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setIsOpen(false);
          }
        }}
        className="btn-ghost flex items-center gap-2 rounded-full border border-[color:var(--border)] px-3 py-1.5 text-sm font-medium text-foreground shadow-[0_0_20px_rgba(15,23,42,0.12)] backdrop-blur-xl transition hover:shadow-[0_0_18px_rgba(56,189,248,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
      >
        <span className="text-base">{currentLanguage.label}</span>
        <ChevronDown strokeWidth={1.5} className="h-3.5 w-3.5 text-muted" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={menuRef}
            role="menu"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className="absolute right-0 top-12 z-50 w-40 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-strong)] p-2 text-sm text-foreground shadow-[0_15px_40px_rgba(2,6,23,0.25)] backdrop-blur-xl"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setIsOpen(false);
                buttonRef.current?.focus();
              }
            }}
          >
            {languages.map((lang) => {
              const isActive = lang.code === currentLocale;
              return (
                <button
                  key={lang.code}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    handleChange(lang.code);
                    setIsOpen(false);
                    buttonRef.current?.focus();
                  }}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition ${
                    isActive
                      ? 'bg-white/10 text-foreground'
                      : 'text-muted hover:bg-white/5 hover:text-foreground'
                  }`}
                >
                  <span>{lang.label}</span>
                  <span className="text-xs text-muted">{lang.name}</span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
