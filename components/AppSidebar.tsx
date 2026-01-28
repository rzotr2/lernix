'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import * as Collapsible from '@radix-ui/react-collapsible';
import {
  Command,
  ChevronRight,
  File,
  Settings,
  Moon,
  Sun,
  Sparkles
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLayout } from '@/contexts/LayoutContext';
import { locales, defaultLocale } from '@/i18n/config';
import LanguagePicker from '@/components/LanguagePicker';

type PageItem = {
  id: string;
  title: string;
  slug: string;
  parent_page_id: string | null;
};

type PageNode = PageItem & { children: PageNode[] };

function buildTree(pages: PageItem[]) {
  const nodes = new Map<string, PageNode>();
  const roots: PageNode[] = [];

  pages.forEach((page) => {
    nodes.set(page.id, { ...page, children: [] });
  });

  nodes.forEach((node) => {
    if (node.parent_page_id && nodes.has(node.parent_page_id)) {
      nodes.get(node.parent_page_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

function findPathBySlug(nodes: PageNode[], slug: string): string[] {
  for (const node of nodes) {
    if (node.slug === slug) {
      return [node.id];
    }
    const childPath = findPathBySlug(node.children, slug);
    if (childPath.length > 0) {
      return [node.id, ...childPath];
    }
  }
  return [];
}

export default function AppSidebar() {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const { session, user } = useAuth();
  const { isSidebarOpen, closeSidebar } = useLayout();
  const [pages, setPages] = useState<PageItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openNodes, setOpenNodes] = useState<Record<string, boolean>>({});
  const [selectedLocale, setSelectedLocale] = useState(defaultLocale);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const locale = pathname.split('/')[1] || 'en';

  const tree = useMemo(() => buildTree(pages), [pages]);
  const activeSlug = useMemo(() => {
    const match = pathname.match(/\/pages\/([^/]+)/);
    return match?.[1] ?? null;
  }, [pathname]);
  const activePathIds = useMemo(() => {
    if (!activeSlug) return new Set<string>();
    return new Set(findPathBySlug(tree, activeSlug));
  }, [tree, activeSlug]);

  const loadPages = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const token = session?.access_token;
      if (!token) {
        throw new Error('Unauthorized');
      }

      const response = await fetch('/api/pages', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        throw new Error('Failed to load pages');
      }
      const data = await response.json();
      setPages(data.pages || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pages');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!session?.access_token) return;
    loadPages();
    const handler = () => loadPages();
    window.addEventListener('pages:refresh', handler);
    return () => window.removeEventListener('pages:refresh', handler);
  }, [session?.access_token]);

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
    setSelectedLocale(nextLocale as (typeof locales)[number]);
  };

  const handleCreate = async () => {
    try {
      const token = session?.access_token;
      if (!token) {
        throw new Error('Unauthorized');
      }

      const response = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: t('pages.newPageTitle') })
      });
      if (!response.ok) {
        throw new Error('Failed to create page');
      }
      const data = await response.json();
      const created = data.page as PageItem;
      setPages((prev) => [...prev, created]);
      window.dispatchEvent(new Event('pages:refresh'));
      router.push(`/${locale}/pages/${created.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create page');
    }
  };

  const renderNode = (node: PageNode, depth = 0) => {
    const hasChildren = node.children.length > 0;
    const isActive = activeSlug === node.slug;
    const isOpen = hasChildren ? openNodes[node.id] ?? activePathIds.has(node.id) : false;
    const indent = 14 + depth * 16;
    const Icon = File;
    const iconClass = isActive
      ? 'text-cyan-400 drop-shadow-[0_0_10px_rgba(56,189,248,0.7)]'
      : 'text-muted';

    return (
      <motion.div key={node.id} layout className="space-y-1">
        <Collapsible.Root
          open={isOpen}
          onOpenChange={(open) => setOpenNodes((prev) => ({ ...prev, [node.id]: open }))}
        >
          <div className="relative group">
            {depth > 0 && (
              <span
                className="pointer-events-none absolute bottom-0 top-0 w-px bg-[color:var(--border)] transition-colors group-hover:bg-cyan-400/40"
                style={{ left: `${indent - 10}px` }}
              />
            )}
            <motion.div
              layout
              whileHover={{ x: 2 }}
              className={`relative flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                isActive
                  ? 'bg-white/10 text-foreground [text-shadow:0_0_12px_rgba(59,130,246,0.45)]'
                  : 'text-muted hover:bg-white/5 hover:text-foreground'
              }`}
              style={{ paddingLeft: `${indent}px` }}
            >
              <Link
                href={`/${locale}/pages/${node.slug}`}
                onClick={closeSidebar}
                className="flex w-full items-center gap-2"
              >
                <Icon
                  strokeWidth={1.5}
                  className={iconClass}
                  {...(isActive ? { fill: 'currentColor' } : {})}
                />
                <span className="flex-1 truncate">{node.title}</span>
              </Link>
              {hasChildren && (
                <Collapsible.Trigger
                  type="button"
                  className="ml-auto flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--surface-3)] p-1.5 text-muted transition-colors hover:text-foreground"
                  aria-label={isOpen ? 'Collapse' : 'Expand'}
                >
                  <motion.span animate={{ rotate: isOpen ? 90 : 0 }}>
                    <ChevronRight strokeWidth={1.5} className="h-3.5 w-3.5" />
                  </motion.span>
                </Collapsible.Trigger>
              )}
            </motion.div>
          </div>

          <AnimatePresence initial={false}>
            {hasChildren && isOpen && (
              <Collapsible.Content asChild>
                <motion.div
                  layout
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="space-y-1"
                >
                  {node.children.map((child) => renderNode(child, depth + 1))}
                </motion.div>
              </Collapsible.Content>
            )}
          </AnimatePresence>
        </Collapsible.Root>
      </motion.div>
    );
  };

  return (
    <aside
      className={`fixed left-0 top-[var(--topbar-height)] z-40 h-[calc(100vh-var(--topbar-height))] w-full sm:w-80 lg:w-72 border-r border-[color:var(--border)] bg-[color:var(--surface-1)] backdrop-blur-xl transition-transform duration-300 lg:translate-x-0 ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="flex h-full flex-col">
        <div className="flex-1 space-y-6 px-5 py-6">
          <div className="space-y-3">
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleCreate}
              className="group relative w-full rounded-full bg-gradient-to-r from-violet-500/40 via-indigo-500/40 to-sky-400/40 p-[1px] shadow-[0_0_20px_rgba(56,189,248,0.2)]"
            >
              <span className="flex items-center justify-between rounded-full bg-[color:var(--surface-3)] px-4 py-2 text-sm font-medium text-foreground transition-colors group-hover:bg-[color:var(--surface-2)]">
                <span className="flex items-center gap-2">
                  <Sparkles
                    strokeWidth={1.5}
                    className="h-4 w-4 text-cyan-400 drop-shadow-[0_0_10px_rgba(56,189,248,0.8)]"
                  />
                  {t('pages.newPage')}
                </span>
                <span className="text-xs text-muted">Action Hub</span>
              </span>
              <span className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-r from-violet-400/10 via-cyan-400/10 to-blue-400/10 opacity-0 blur-2xl transition-opacity group-hover:opacity-100" />
            </motion.button>

            <motion.button
              type="button"
              whileHover={{ y: -1 }}
              className="btn-ghost flex w-full items-center justify-between rounded-full border border-[color:var(--border)] px-3 py-1.5 text-xs text-muted transition-colors"
            >
              <span className="flex items-center gap-2">
                <Command strokeWidth={1.5} className="h-3.5 w-3.5 text-cyan-400" />
                Quick Search
              </span>
              <span className="flex items-center gap-1 rounded-full border border-[color:var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted">
                CMD K
              </span>
            </motion.button>
          </div>

          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.3em] text-muted">
              Navigation
            </div>

            {isLoading && (
              <div className="text-xs text-muted">{t('pages.loading')}</div>
            )}
            {error && <div className="text-xs text-rose-500">{error}</div>}

            {!isLoading && !error && pages.length === 0 && (
              <div className="text-sm text-muted">{t('pages.empty')}</div>
            )}

            <div className="max-h-[60vh] overflow-y-auto overflow-x-auto">
              <div className="space-y-1 min-w-max">{tree.map((node) => renderNode(node))}</div>
            </div>
          </div>
        </div>

        <div className="px-5 pb-6">
          <div className="mb-4 flex items-center justify-between gap-3 lg:hidden">
            <LanguagePicker
              currentLocale={selectedLocale}
              onLocaleChange={handleLocaleChange}
            />
            <button
              type="button"
              onClick={handleToggleTheme}
              aria-label="Toggle theme"
              className="btn-ghost inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 backdrop-blur-md transition hover:shadow-[0_0_18px_rgba(56,189,248,0.3)]"
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

          <motion.div
            whileHover={{ y: -2 }}
            className="flex items-center justify-between rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-3 shadow-[0_0_20px_rgba(15,23,42,0.18)] transition-colors hover:bg-[color:var(--surface-3)]"
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <span className="absolute inset-0 rounded-full bg-cyan-400/30 blur-md" />
                <div className="relative h-10 w-10 overflow-hidden rounded-full border border-cyan-200/40 bg-[color:var(--surface-strong)]">
                  {user?.user_metadata?.avatar_url || user?.user_metadata?.picture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user?.user_metadata?.avatar_url || user?.user_metadata?.picture}
                      alt={user?.user_metadata?.full_name || user?.email || 'User'}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-foreground">
                      {(user?.user_metadata?.full_name || user?.email || 'Pilot')
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">
                  {user?.user_metadata?.full_name ||
                    user?.user_metadata?.name ||
                    user?.email?.split('@')[0] ||
                    'Pilot'}
                </div>
                <div className="text-xs text-muted">Pilot Badge</div>
              </div>
            </div>
            <Link
              href="/profile"
              onClick={closeSidebar}
              className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface-3)] p-2 text-muted transition-colors hover:text-foreground"
              aria-label="Settings"
            >
              <Settings strokeWidth={1.5} className="h-4 w-4" />
            </Link>
          </motion.div>
        </div>
      </div>
    </aside>
  );
}
