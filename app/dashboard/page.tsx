'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { locales, defaultLocale } from '@/i18n/config';

export default function DashboardRedirect() {
  const router = useRouter();

  useEffect(() => {
    const stored = window.localStorage.getItem('locale');
    const isValid = locales.includes(stored as (typeof locales)[number]);
    const nextLocale = isValid ? stored : defaultLocale;
    router.replace(`/${nextLocale}/dashboard`);
  }, [router]);

  return null;
}
