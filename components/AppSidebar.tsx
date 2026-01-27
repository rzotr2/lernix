'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/AuthContext';
import { useLayout } from '@/contexts/LayoutContext';

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

export default function AppSidebar() {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useAuth();
  const { isSidebarOpen, closeSidebar } = useLayout();
  const [pages, setPages] = useState<PageItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locale = pathname.split('/')[1] || 'en';

  const tree = useMemo(() => buildTree(pages), [pages]);

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

  const renderNode = (node: PageNode, depth = 0) => (
    <div key={node.id}>
      <Link
        href={`/${locale}/pages/${node.slug}`}
        onClick={closeSidebar}
        className={`block text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md px-2 py-1 ${
          pathname.includes(`/pages/${node.slug}`) ? 'bg-slate-100 dark:bg-slate-800' : ''
        }`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {node.title}
      </Link>
      {node.children.map((child) => renderNode(child, depth + 1))}
    </div>
  );

  return (
    <aside
      className={`fixed left-0 top-[var(--topbar-height)] z-40 h-[calc(100vh-var(--topbar-height))] w-64 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-neutral-dark transition-transform duration-200 lg:translate-x-0 ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="h-full overflow-y-auto p-4 space-y-4">
        <button
          onClick={handleCreate}
          className="w-full px-3 py-2 text-sm font-medium bg-primary hover:bg-primary-dark text-white rounded-md transition-colors"
        >
          {t('pages.newPage')}
        </button>

        {isLoading && (
          <div className="text-xs text-slate-500">{t('pages.loading')}</div>
        )}
        {error && (
          <div className="text-xs text-red-500">{error}</div>
        )}

        {!isLoading && !error && pages.length === 0 && (
          <div className="text-sm text-slate-500 dark:text-slate-400">
            {t('pages.empty')}
          </div>
        )}

        <div className="space-y-1">
          {tree.map((node) => renderNode(node))}
        </div>
      </div>
    </aside>
  );
}
