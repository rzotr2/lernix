'use client';

import { useTranslations } from 'next-intl';
import {
  Users,
  CreditCard,
  Activity,
  TrendingUp
} from 'lucide-react';
import { MetricCard } from '@/components/MetricCard';

export default function DashboardPage() {
  const t = useTranslations();

  const metrics = [
    {
      label: t('metrics.totalUsers'),
      value: '1,234',
      icon: <Users className="h-5 w-5 text-primary" />
    },
    {
      label: t('metrics.revenue'),
      value: '$12.4k',
      icon: <CreditCard className="h-5 w-5 text-primary" />
    },
    {
      label: t('metrics.activeSessions'),
      value: '432',
      icon: <Activity className="h-5 w-5 text-primary" />
    },
    {
      label: t('metrics.growthRate'),
      value: '18.2%',
      icon: <TrendingUp className="h-5 w-5 text-primary" />
    }
  ];

  const recentActivity = [
    { id: 1, text: t('activity.items.signup') },
    { id: 2, text: t('activity.items.payment') },
    { id: 3, text: t('activity.items.settings') }
  ];

  return (
    <div className="p-6 text-foreground">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">
          {t('dashboard.title')}
        </h1>
        <p className="text-sm text-muted">
          {t('dashboard.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            number={metric.value}
            label={metric.label}
            icon={metric.icon}
          />
        ))}
      </div>

      <div className="glass-surface-strong mt-8 rounded-xl p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          {t('activity.title')}
        </h2>
        <div className="space-y-3 text-sm text-foreground">
          {recentActivity.length === 0 ? (
            <p className="text-muted">
              {t('activity.empty')}
            </p>
          ) : (
            recentActivity.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-primary" />
                <span>{item.text}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
