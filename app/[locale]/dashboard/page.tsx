'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getDashboardData, type DashboardData } from '@/services/dashboardService';
import { DashboardClientPage } from '@/components/DashboardClientPage';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useTranslations } from 'next-intl';

export default function DashboardPage() {
  const { supabase, user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const t = useTranslations('dashboard');

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        console.log('[dashboard] load start');
        const dashboardData = await getDashboardData(supabase);
        if (!active) return;
        setData(dashboardData);
        console.log('[dashboard] load done', dashboardData);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    load();
    const refresh = () => load();
    window.addEventListener('dashboard:refresh', refresh);
    return () => {
      active = false;
      window.removeEventListener('dashboard:refresh', refresh);
    };
  }, [user, supabase]);

  if (isLoading) {
    return (
      <div className="h-full w-full">
        <LoadingSpinner fullScreen={false} className="h-full w-full" />
      </div>
    );
  }

  if (!data) {
    return <div>{t('error.loading')}</div>;
  }

  return <DashboardClientPage data={data} />;
}
