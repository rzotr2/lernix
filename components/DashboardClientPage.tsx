'use client';

import { useTranslations } from 'next-intl';
import {
  Flame,
  Database,
  Brain,
  Sparkles,
  Star
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { DashboardCard } from '@/components/DashboardCard';
import { useAuth } from '@/contexts/AuthContext';
import { createPage } from '@/services/pagesService';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMemo } from 'react';
import type { DashboardData, DashboardActivity, DashboardRecentPage } from '@/services/dashboardService';

function getDisplayName(user: { user_metadata?: Record<string, unknown>; email?: string } | null): string {
  if (!user) return '';
  const meta = user.user_metadata;
  if (meta?.full_name && typeof meta.full_name === 'string') return meta.full_name.trim();
  const given = meta?.given_name;
  const family = meta?.family_name;
  if (given || family) return [given, family].filter(Boolean).join(' ').trim();
  if (meta?.name && typeof meta.name === 'string') return meta.name.trim();
  if (user.email) return user.email.split('@')[0] ?? '';
  return '';
}

type TooltipPayload = { value: number };
const CustomTooltip = ({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-surface-strong rounded-lg p-3 text-sm shadow-lg">
        <p className="label text-muted">{`${label}`}</p>
        <p className="intro text-foreground font-bold">{`Pages Created: ${payload[0].value}`}</p>
      </div>
    );
  }

  return null;
};

export function DashboardClientPage({ data }: { data: DashboardData }) {
  const t = useTranslations('dashboard');
  const tPages = useTranslations('pages');
  const { user, session } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const locale = pathname.split('/')[1] || 'en';
  const displayName = useMemo(() => getDisplayName(user), [user]);
  const welcomeName = displayName || t('defaultName');

  const handleCreateNote = async () => {
    if (!session?.access_token) return;
    try {
      const created = await createPage({
        token: session.access_token,
        title: tPages('newPageTitle')
      });
      window.dispatchEvent(new Event('pages:refresh'));
      router.push(`/${locale}/pages/${created.slug}?ai=1`);
    } catch (error) {
      console.error('Failed to create page:', error);
    }
  };

  const chartData = useMemo(() => {
    const rows = data?.activity30Days || [];
    return rows.map((row: DashboardActivity) => ({
      name: row.date,
      value: row.pagesCreated || 0
    }));
  }, [data]);

  const totalPages = data?.stats?.total_pages_count || 0;
  const totalAiCalls = data?.stats?.total_ai_calls || 0;
  const pagesWithAi = data?.stats?.pages_with_ai_count || 0;
  const aiUsagePercent = data?.aiUsagePercent || 0;

  const metrics = [
    {
      title: t('totalPages'),
      value: `${totalPages}`,
      icon: <Flame className="h-6 w-6" />
    },
    {
      title: t('totalAiCalls'),
      value: `${totalAiCalls}`,
      icon: <Database className="h-6 w-6" />
    },
    {
      title: t('pagesWithAi'),
      value: `${pagesWithAi}`,
      icon: <Brain className="h-6 w-6" />
    },
    {
      title: t('aiUsagePercent'),
      value: `${aiUsagePercent}%`,
      icon: <Sparkles className="h-6 w-6" />
    }
  ];

  return (
    <div className="p-6 text-foreground bg-obsidian min-h-screen">
      {/* Hero Section */}
      <motion.div
        className="glass-surface-strong rounded-2xl p-6 mb-8 flex items-center justify-between"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {t('title', { name: welcomeName })}
          </h1>
          <p className="text-sm text-muted mt-1">{t('dailyTip')}</p>
        </div>
        <motion.button
          type="button"
          onClick={handleCreateNote}
          className="dashboard-new-note bg-gradient-to-r from-electric-blue to-neon-violet text-white font-bold py-3 px-6 rounded-full shadow-lg"
          whileHover={{ scale: 1.05, boxShadow: '0 0 20px #6B46C1' }}
        >
          {t('newGeneration')}
        </motion.button>
      </motion.div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {metrics.map((metric, i) => (
          <motion.div
            key={metric.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
          >
            <DashboardCard
              title={metric.title}
              value={metric.value}
              icon={metric.icon}
            />
          </motion.div>
        ))}
      </div>

      {/* Recent Projects */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-foreground mb-4">
          {t('recentProjects')}
        </h2>
        {(data?.recentPages || []).length === 0 ? (
          <div className="text-sm text-muted">{t('recentEmpty')}</div>
        ) : (
          <div className="flex space-x-6 overflow-x-auto p-4">
            {(data?.recentPages || []).map((project: DashboardRecentPage) => (
              <motion.div
                key={project.id}
                className="glass-surface-strong rounded-2xl p-4 flex-shrink-0 w-64"
                whileHover={{ y: -5, boxShadow: '0 0 15px #0B0F19' }}
              >
                <Link href={`/${locale}/pages/${project.slug}`}>
                  <h3 className="font-bold text-foreground">{project.title}</h3>
                  <p className="text-sm text-muted">
                    {new Date(project.updated_at).toLocaleDateString()}
                  </p>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Favorites */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-foreground mb-4">
          {t('favorites')}
        </h2>
        {(data?.favorites || []).length === 0 ? (
          <div className="text-sm text-muted">{t('favoritesEmpty')}</div>
        ) : (
          <div className="flex space-x-6 overflow-x-auto p-4">
            {(data?.favorites || []).map((project: DashboardRecentPage) => (
              <motion.div
                key={project.id}
                className="glass-surface-strong rounded-2xl p-4 flex-shrink-0 w-64"
                whileHover={{ y: -5, boxShadow: '0 0 15px #0B0F19' }}
              >
                <Link href={`/${locale}/pages/${project.slug}`}>
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-amber-300" fill="currentColor" />
                    <h3 className="font-bold text-foreground">{project.title}</h3>
                  </div>
                  <p className="text-sm text-muted">
                    {new Date(project.updated_at).toLocaleDateString()}
                  </p>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Analytics & Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-xl font-semibold text-foreground mb-4">
            {t('contentGenerated')}
          </h2>
          <div className="glass-surface-strong rounded-2xl p-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="#8884d8"
                      stopOpacity={0.8}
                    />
                    <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#4A5568" />
                <YAxis stroke="#4A5568" />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#8884d8"
                  fillOpacity={1}
                  fill="url(#colorUv)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-4">
              {t('aiActivity')}
            </h2>
            <div className="glass-surface-strong rounded-2xl p-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={(data?.activity30Days || []).map((row: DashboardActivity) => ({
                  name: row.date,
                  value: row.aiCalls || 0
                }))}>
                  <defs>
                    <linearGradient id="colorAi" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0EA5E9" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" stroke="#4A5568" />
                  <YAxis stroke="#4A5568" />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#0EA5E9"
                    fillOpacity={1}
                    fill="url(#colorAi)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-4">
            {t('subscriptionStatus')}
          </h2>
          <div className="glass-surface-strong rounded-2xl p-4 space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted">{t('trialStatus')}</span>
                <span className="text-foreground">
                  {data?.trialStatus?.active ? t('trialActive') : t('trialExpired')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">{t('subscription')}</span>
                <span className="text-foreground">
                  {data?.subscriptionStatus?.subscription_status || t('subscriptionNone')}
                </span>
              </div>
              {data?.trialStatus?.end_time && (
                <div className="text-xs text-muted">
                  {t('trialEnds')} {new Date(data.trialStatus.end_time).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
