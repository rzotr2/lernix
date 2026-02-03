'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import * as Collapsible from '@radix-ui/react-collapsible';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  Search,
  ChevronRight,
  File,
  CornerDownRight,
  Settings,
  Moon,
  Sun,
  Sparkles,
  Star
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLayout } from '@/contexts/LayoutContext';
import { createPage } from '@/services/pagesService';
import { locales, defaultLocale } from '@/i18n/config';
import LanguagePicker from '@/components/LanguagePicker';

type PageItem = {
  id: string;
  title: string;
  slug: string;
  parent_page_id: string | null;
  is_favorite?: boolean;
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
  const [spotlightPos, setSpotlightPos] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filteredPages, setFilteredPages] = useState<PageItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchCacheRef = useRef<Map<string, string>>(new Map());
  const searchInFlightRef = useRef<Map<string, Promise<string>>>(new Map());
  const searchVersionRef = useRef(0);
  const [contextMenu, setContextMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    page: PageItem | null;
  }>({ open: false, x: 0, y: 0, page: null });
  const asideRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const locale = pathname.split('/')[1] || 'en';

  const displayedPages = searchQuery.trim() ? filteredPages : pages;
  const tree = useMemo(() => buildTree(displayedPages), [displayedPages]);
  const activeSlug = useMemo(() => {
    const match = pathname.match(/\/pages\/([^/]+)/);
    return match?.[1] ?? null;
  }, [pathname]);
  const activePathIds = useMemo(() => {
    if (!activeSlug) return new Set<string>();
    return new Set(findPathBySlug(tree, activeSlug));
  }, [tree, activeSlug]);

  const loadPages = useCallback(async () => {
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
      setFilteredPages(data.pages || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pages');
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (!session?.access_token) return;
    loadPages();
    const handler = () => loadPages();
    window.addEventListener('pages:refresh', handler);
    return () => window.removeEventListener('pages:refresh', handler);
  }, [loadPages, session?.access_token]);

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
      const created = (await createPage({
        token,
        title: t('pages.newPageTitle')
      })) as PageItem;
      setPages((prev) => [...prev, created]);
      window.dispatchEvent(new Event('pages:refresh'));
      router.push(`/${locale}/pages/${created.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create page');
    }
  };

  const closeContextMenu = () => {
    setContextMenu({ open: false, x: 0, y: 0, page: null });
  };

  useEffect(() => {
    if (!contextMenu.open) return;
    const handleClick = () => closeContextMenu();
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu.open]);

  useLayoutEffect(() => {
    if (!contextMenu.open || !contextMenuRef.current) return;
    const menu = contextMenuRef.current;
    const rect = menu.getBoundingClientRect();
    const containerRect = asideRef.current?.getBoundingClientRect();
    const containerHeight = containerRect?.height || window.innerHeight;
    const edgePadding = 4;
    const offsetX = 12;
    const spaceBelow = containerHeight - contextMenu.y;
    const openUp = spaceBelow < rect.height + edgePadding;

    let x = contextMenu.x + offsetX;
    let y = openUp ? contextMenu.y - rect.height : contextMenu.y;

    if (x < edgePadding) x = edgePadding;

    if (y + rect.height > containerHeight - edgePadding) {
      y = Math.max(edgePadding, containerHeight - rect.height - edgePadding);
    }
    if (y < edgePadding) y = edgePadding;

    setContextMenuPos({ x, y });
  }, [contextMenu.open, contextMenu.x, contextMenu.y]);

  const handleRename = async (page: PageItem, nextTitle: string) => {
    const trimmed = nextTitle.trim();
    if (!trimmed || trimmed === page.title) {
      setRenamingId(null);
      return;
    }
    const token = session?.access_token;
    if (!token) return;
    const response = await fetch(`/api/pages/${page.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: trimmed })
    });
    if (!response.ok) return;
    const data = await response.json();
    const updated = data.page as PageItem;
    setPages((prev) => prev.map((item) => (item.id === page.id ? { ...item, title: updated.title } : item)));
    setFilteredPages((prev) => prev.map((item) => (item.id === page.id ? { ...item, title: updated.title } : item)));
    window.dispatchEvent(new Event('pages:refresh'));
    setRenamingId(null);
  };

  const handleDelete = async (page: PageItem) => {
    const token = session?.access_token;
    if (!token) return;
    const confirmed = window.confirm(t('pages.deleteConfirm'));
    if (!confirmed) return;
    const response = await fetch(`/api/pages/${page.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return;
    setPages((prev) => prev.filter((item) => item.id !== page.id));
    setFilteredPages((prev) => prev.filter((item) => item.id !== page.id));
    window.dispatchEvent(new Event('pages:refresh'));
    if (activeSlug === page.slug) {
      router.replace(`/${locale}`);
    }
  };

  const handleDuplicate = async (page: PageItem) => {
    const token = session?.access_token;
    if (!token) return;
    const response = await fetch(`/api/pages/${page.id}/duplicate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return;
    const data = await response.json();
    const created = data.page as PageItem;
    setPages((prev) => [...prev, created]);
    setFilteredPages((prev) => [...prev, created]);
    window.dispatchEvent(new Event('pages:refresh'));
    router.push(`/${locale}/pages/${created.slug}`);
  };

  const handleCreateSubpage = async (page: PageItem) => {
    const token = session?.access_token;
    if (!token) return;
    const response = await fetch('/api/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: t('pages.newPageTitle'), parent_page_id: page.id })
    });
    if (!response.ok) return;
    const data = await response.json();
    const created = data.page as PageItem;
    setPages((prev) => [...prev, created]);
    setFilteredPages((prev) => [...prev, created]);
    window.dispatchEvent(new Event('pages:refresh'));
    router.push(`/${locale}/pages/${created.slug}`);
  };

  const handleToggleFavorite = async (page: PageItem) => {
    const token = session?.access_token;
    if (!token) return;
    const isFavorite = !!page.is_favorite;
    const response = await fetch(`/api/pages/${page.id}/favorite`, {
      method: isFavorite ? 'DELETE' : 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return;
    setPages((prev) =>
      prev.map((item) => (item.id === page.id ? { ...item, is_favorite: !isFavorite } : item))
    );
    setFilteredPages((prev) =>
      prev.map((item) => (item.id === page.id ? { ...item, is_favorite: !isFavorite } : item))
    );
    window.dispatchEvent(new Event('dashboard:refresh'));
  };

  const handleCopyLink = async (page: PageItem) => {
    const url = `${window.location.origin}/${locale}/pages/${page.slug}`;
    await navigator.clipboard.writeText(url);
  };

  const handleExportPdf = async (page: PageItem) => {
    const token = session?.access_token;
    if (!token) return;
    const response = await fetch('/api/export/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ page_id: page.id, locale })
    });
    if (!response.ok) return;
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${page.title || 'page'}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleOpenNewTab = (page: PageItem) => {
    window.open(`/${locale}/pages/${page.slug}`, '_blank', 'noopener,noreferrer');
  };

  const handleOpenPage = (page: PageItem) => {
    closeContextMenu();
    router.push(`/${locale}/pages/${page.slug}`);
    closeSidebar();
  };

  type TextBlock = { type?: string; content?: Record<string, unknown> };
  type ChecklistItem = { text?: string };
  type DefinitionItem = { term?: string; definition?: string };
  type FaqItem = { question?: string; answer?: string };
  type StepItem = { title?: string; description?: string };
  type TimelineItem = { title?: string; description?: string };
  type GraphNode = { label?: string; id?: string };

  const extractBlockText = useCallback((block: TextBlock): string => {
    const content = block?.content || {};
    switch (block?.type) {
      case 'heading':
      case 'paragraph':
      case 'quote':
      case 'callout':
      case 'summary':
        return String((content as { text?: unknown }).text || '');
      case 'code':
        return String((content as { code?: unknown }).code || '');
      case 'list':
      case 'takeaways':
        return Array.isArray((content as { items?: unknown }).items)
          ? (content as { items: string[] }).items.join(' ')
          : '';
      case 'checklist':
        return Array.isArray((content as { items?: unknown }).items)
          ? (content as { items: ChecklistItem[] }).items.map((item) => item?.text || '').join(' ')
          : '';
      case 'definitions':
        return Array.isArray((content as { items?: unknown }).items)
          ? (content as { items: DefinitionItem[] }).items
              .map((item) => `${item?.term || ''} ${item?.definition || ''}`)
              .join(' ')
          : '';
      case 'faq':
        return Array.isArray((content as { items?: unknown }).items)
          ? (content as { items: FaqItem[] }).items
              .map((item) => `${item?.question || ''} ${item?.answer || ''}`)
              .join(' ')
          : '';
      case 'steps':
        return Array.isArray((content as { steps?: unknown }).steps)
          ? (content as { steps: StepItem[] }).steps
              .map((item) => `${item?.title || ''} ${item?.description || ''}`)
              .join(' ')
          : '';
      case 'timeline':
        return Array.isArray((content as { items?: unknown }).items)
          ? (content as { items: TimelineItem[] }).items
              .map((item) => `${item?.title || ''} ${item?.description || ''}`)
              .join(' ')
          : '';
      case 'table':
        return Array.isArray((content as { rows?: unknown }).rows)
          ? (content as { rows: string[][] }).rows.flat().join(' ')
          : '';
      case 'mermaid':
        return String((content as { code?: unknown }).code || '');
      case 'graph':
        return Array.isArray((content as { nodes?: unknown }).nodes)
          ? (content as { nodes: GraphNode[] }).nodes
              .map((node) => node?.label || node?.id || '')
              .join(' ')
          : '';
      case 'image':
        return `${(content as { alt?: string }).alt || ''} ${
          (content as { caption?: string }).caption || ''
        }`.trim();
      default:
        return '';
    }
  }, []);

  const getPageSearchText = useCallback(async (pageId: string, token: string) => {
    const cached = searchCacheRef.current.get(pageId);
    if (cached !== undefined) return cached;
    const inFlight = searchInFlightRef.current.get(pageId);
    if (inFlight) return inFlight;
    const promise = fetch(`/api/blocks?pageId=${pageId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load page blocks');
        }
        return response.json();
      })
      .then((data) => {
        const blocks = Array.isArray(data.blocks) ? data.blocks : [];
        const text = blocks.map(extractBlockText).filter(Boolean).join(' ').toLowerCase();
        searchCacheRef.current.set(pageId, text);
        return text;
      })
      .catch(() => {
        const fallback = '';
        searchCacheRef.current.set(pageId, fallback);
        return fallback;
      })
      .finally(() => {
        searchInFlightRef.current.delete(pageId);
      });
    searchInFlightRef.current.set(pageId, promise);
    return promise;
  }, [extractBlockText]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const query = debouncedQuery.trim().toLowerCase();
    if (!query) {
      setFilteredPages(pages);
      setIsSearching(false);
      return;
    }
    const token = session?.access_token;
    if (!token) {
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const currentVersion = ++searchVersionRef.current;
    (async () => {
      const results = await Promise.all(
        pages.map(async (page) => {
          const titleMatch = (page.title || '').toLowerCase().includes(query);
          if (titleMatch) return { page, match: true };
          const contentText = await getPageSearchText(page.id, token);
          return { page, match: contentText.includes(query) };
        })
      );
      if (searchVersionRef.current !== currentVersion) return;
      setFilteredPages(results.filter((result) => result.match).map((result) => result.page));
      setIsSearching(false);
    })();
  }, [debouncedQuery, getPageSearchText, pages, session?.access_token]);

  const renderNode = (node: PageNode, depth = 0) => {
    const hasChildren = node.children.length > 0;
    const isActive = activeSlug === node.slug;
    const isOpen = hasChildren ? openNodes[node.id] ?? activePathIds.has(node.id) : false;
    const indent = 12 + depth * 12;
    const Icon = File;
    const iconClass = isActive
      ? 'text-cyan-400 drop-shadow-[0_0_10px_rgba(56,189,248,0.7)]'
      : 'text-muted';
    const isInActivePath = activePathIds.has(node.id);

    return (
      <motion.div key={node.id} layout="position" className="space-y-1">
        <Collapsible.Root
          open={isOpen}
          onOpenChange={(open) => setOpenNodes((prev) => ({ ...prev, [node.id]: open }))}
        >
          <div className="relative group">
            {depth > 0 && (
              <span
                className={`pointer-events-none absolute bottom-0 top-0 w-px ${
                  isInActivePath ? 'bg-blue-500/50' : 'bg-white/5'
                } transition-colors`}
                style={{ left: `${indent - 8}px` }}
              />
            )}
            <motion.div
              layout
              whileHover={{ x: 2 }}
              onContextMenu={(event) => {
                event.preventDefault();
                const asideRect = asideRef.current?.getBoundingClientRect();
                const localX = asideRect ? event.clientX - asideRect.left : event.clientX;
                const localY = asideRect ? event.clientY - asideRect.top : event.clientY;
                setContextMenu({
                  open: true,
                  x: localX,
                  y: localY,
                  page: node
                });
              }}
              className={`relative flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                isActive
                  ? 'bg-blue-500/10 text-white border-l-2 border-blue-400 [text-shadow:0_0_12px_rgba(59,130,246,0.45)]'
                  : 'text-muted hover:text-foreground'
              } ${
                depth === 0 && hasChildren
                  ? 'sticky top-0 z-10 backdrop-blur-md bg-black/60'
                  : ''
              }`}
              style={{ paddingLeft: `${indent}px` }}
            >
              {depth > 0 && (
                <CornerDownRight
                  strokeWidth={1.2}
                  className={`absolute -left-2 h-3.5 w-3.5 ${
                    isInActivePath ? 'text-blue-400/60' : 'text-white/10'
                  }`}
                  style={{ top: '50%', transform: 'translateY(-50%)' }}
                />
              )}
              <Tooltip.Provider>
                <Tooltip.Root delayDuration={150}>
                  <Tooltip.Trigger asChild>
                    <div className="flex w-full items-center gap-2 min-w-0">
                      {renamingId === node.id ? (
                        <div className="flex w-full items-center gap-2 min-w-0">
                          <Icon
                            strokeWidth={1.5}
                            className={iconClass}
                            {...(isActive ? { fill: 'currentColor' } : {})}
                          />
                          <input
                            value={renameValue}
                            onChange={(event) => setRenameValue(event.target.value)}
                            onBlur={() => handleRename(node, renameValue)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.currentTarget.blur();
                              }
                              if (event.key === 'Escape') {
                                setRenamingId(null);
                              }
                            }}
                            className="flex-1 min-w-0 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-3)] px-2 py-1 text-xs text-foreground outline-none"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <Link
                          href={`/${locale}/pages/${node.slug}`}
                          onClick={closeSidebar}
                          className="flex w-full items-center gap-2 min-w-0"
                        >
                          <Icon
                            strokeWidth={1.5}
                            className={iconClass}
                            {...(isActive ? { fill: 'currentColor' } : {})}
                          />
                          <span className="flex-1 truncate">{node.title}</span>
                        </Link>
                      )}
                      {node.is_favorite ? (
                        <Star
                          strokeWidth={1.5}
                          className="h-3.5 w-3.5 text-amber-300"
                          fill="currentColor"
                          aria-label="Favorite"
                        />
                      ) : null}
                    </div>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      side="right"
                      sideOffset={10}
                      className="z-50 rounded-xl border border-white/10 bg-[color:var(--surface-2)] px-3 py-2 text-xs text-foreground shadow-[0_20px_60px_rgba(2,6,23,0.35)] backdrop-blur-xl"
                    >
                      {node.title}
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>
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
      <div ref={asideRef} className="relative flex h-full flex-col">
        <div className="flex-1 flex flex-col min-h-0 space-y-6 px-5 py-6">
          <div className="space-y-3">
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleCreate}
              className="btn-ghost flex w-full items-center justify-between rounded-full border border-[color:var(--border)] px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-blue-400/40"
            >
              <span className="flex items-center gap-2">
                <Sparkles strokeWidth={1.5} className="h-4 w-4 text-cyan-400" />
                {t('pages.newPage')}
              </span>
            </motion.button>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t('sidebar.smartSearchPlaceholder')}
                className="input-field w-full rounded-full pl-9 pr-8 py-2 text-xs"
              />
              {searchQuery.trim() ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:text-foreground"
                  aria-label={t('sidebar.clearSearch')}
                >
                  ×
                </button>
              ) : null}
            </div>
          </div>

          <div className="space-y-2 flex flex-col min-h-0">
            <div className="text-[11px] uppercase tracking-[0.3em] text-muted">
              Navigation
            </div>

            {isLoading && (
              <div className="text-xs text-muted">{t('pages.loading')}</div>
            )}
            {isSearching && searchQuery.trim() && (
              <div className="text-xs text-muted">{t('sidebar.searching')}</div>
            )}
            {error && <div className="text-xs text-rose-500">{error}</div>}

            {!isLoading && !error && displayedPages.length === 0 && (
              <div className="text-sm text-muted">{t('pages.empty')}</div>
            )}

            <Tooltip.Provider>
              <div
                className="group relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden nav-scroll"
                onMouseMove={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setSpotlightPos({
                    x: event.clientX - rect.left,
                    y: event.clientY - rect.top
                  });
                }}
              >
                <div
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                  style={{
                    backgroundImage: `radial-gradient(180px circle at ${spotlightPos.x}px ${spotlightPos.y}px, rgba(59,130,246,0.12), transparent 60%)`
                  }}
                />
                <div className="space-y-1 min-w-0">{tree.map((node) => renderNode(node))}</div>
              </div>
            </Tooltip.Provider>
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

        {contextMenu.open && contextMenu.page ? (
          <div
            ref={contextMenuRef}
            className="absolute z-[60] min-w-[190px] rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-strong)] p-1 text-[13px] text-foreground shadow-[0_16px_40px_rgba(2,6,23,0.35)]"
            style={{ top: contextMenuPos.y, left: contextMenuPos.x }}
            onClick={(event) => event.stopPropagation()}
          >
          <button
            type="button"
            onClick={() => handleOpenPage(contextMenu.page!)}
            className="w-full rounded-md px-2.5 py-1.5 text-left hover:bg-[color:var(--surface-3)]"
          >
            {t('pages.open')}
          </button>
          <button
            type="button"
            onClick={() => {
              setRenamingId(contextMenu.page!.id);
              setRenameValue(contextMenu.page!.title || '');
              closeContextMenu();
            }}
            className="w-full rounded-md px-2.5 py-1.5 text-left hover:bg-[color:var(--surface-3)]"
          >
            {t('pages.rename')}
          </button>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              handleCreateSubpage(contextMenu.page!);
            }}
            className="w-full rounded-md px-2.5 py-1.5 text-left hover:bg-[color:var(--surface-3)]"
          >
            {t('pages.newChild')}
          </button>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              handleDuplicate(contextMenu.page!);
            }}
            className="w-full rounded-md px-2.5 py-1.5 text-left hover:bg-[color:var(--surface-3)]"
          >
            {t('pages.duplicate')}
          </button>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              handleToggleFavorite(contextMenu.page!);
            }}
            className="w-full rounded-md px-2.5 py-1.5 text-left hover:bg-[color:var(--surface-3)]"
          >
            {contextMenu.page.is_favorite ? t('pages.removeFromFavorites') : t('pages.addToFavorites')}
          </button>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              handleCopyLink(contextMenu.page!);
            }}
            className="w-full rounded-md px-2.5 py-1.5 text-left hover:bg-[color:var(--surface-3)]"
          >
            {t('pages.copyLink')}
          </button>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              handleExportPdf(contextMenu.page!);
            }}
            className="w-full rounded-md px-2.5 py-1.5 text-left hover:bg-[color:var(--surface-3)]"
          >
            {t('pages.exportPdf')}
          </button>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              handleOpenNewTab(contextMenu.page!);
            }}
            className="w-full rounded-md px-2.5 py-1.5 text-left hover:bg-[color:var(--surface-3)]"
          >
            {t('pages.openNewTab')}
          </button>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              handleDelete(contextMenu.page!);
            }}
            className="w-full rounded-md px-2.5 py-1.5 text-left text-red-500 hover:bg-red-500/10"
          >
            {t('pages.delete')}
          </button>
          </div>
        ) : null}
    </aside>
  );
}
