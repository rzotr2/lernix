'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/AuthContext';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { createPortal } from 'react-dom';
import {
  Globe,
  Check,
  GripVertical,
  Edit2,
  Sparkles,
  Trash2,
  UploadCloud,
  FileText,
  Plus,
  X,
  Wand2,
  Star
} from 'lucide-react';
import TableBlock from '@/components/ai-blocks/TableBlock';
import FlashcardBlock from '@/components/ai-blocks/FlashcardBlock';
import QuizBlock from '@/components/ai-blocks/QuizBlock';
import TimelineBlock from '@/components/ai-blocks/TimelineBlock';
import MermaidBlock from '@/components/ai-blocks/MermaidBlock';
import GraphBlock from '@/components/ai-blocks/GraphBlock';
import { TextWithSpans } from '@/components/TextWithSpans';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type PageItem = {
  id: string;
  title: string;
  slug: string;
  parent_page_id: string | null;
  owner_id?: string | null;
  is_favorite?: boolean;
};

type BlockType =
  | 'heading'
  | 'paragraph'
  | 'quote'
  | 'callout'
  | 'list'
  | 'checklist'
  | 'definitions'
  | 'code'
  | 'image'
  | 'attachment'
  | 'divider'
  | 'table'
  | 'timeline'
  | 'steps'
  | 'quiz'
  | 'flashcard'
  | 'flashcard_deck'
  | 'faq'
  | 'summary'
  | 'takeaways'
  | 'mermaid'
  | 'graph';

type BlockItem = {
  id: string;
  page_id: string;
  logical_id: string;
  type: BlockType;
  content: Record<string, any>;
  position: number;
  version: number;
  is_deleted?: boolean;
};

type AttachmentItem = {
  id: string;
  page_id: string;
  filename: string;
  file_type: string;
  file_size: number;
  created_at: string;
  uploaded_by: string;
  signed_url: string | null;
  parsed_text?: string;
};

const blockTypes: { value: BlockType; labelKey: string; icon: string }[] = [
  { value: 'heading', labelKey: 'blocks.types.heading', icon: 'H' },
  { value: 'paragraph', labelKey: 'blocks.types.paragraph', icon: '¶' },
  { value: 'quote', labelKey: 'blocks.types.quote', icon: '❝' },
  { value: 'callout', labelKey: 'blocks.types.callout', icon: '💬' },
  { value: 'list', labelKey: 'blocks.types.list', icon: '•' },
  { value: 'checklist', labelKey: 'blocks.types.checklist', icon: '☑️' },
  { value: 'definitions', labelKey: 'blocks.types.definitions', icon: '📘' },
  { value: 'code', labelKey: 'blocks.types.code', icon: '</>' },
  { value: 'image', labelKey: 'blocks.types.image', icon: '🖼️' },
  { value: 'table', labelKey: 'blocks.types.table', icon: '▦' },
  { value: 'timeline', labelKey: 'blocks.types.timeline', icon: '⏱️' },
  { value: 'steps', labelKey: 'blocks.types.steps', icon: '➔' },
  { value: 'quiz', labelKey: 'blocks.types.quiz', icon: '❓' },
  { value: 'flashcard', labelKey: 'blocks.types.flashcard', icon: '🧠' },
  { value: 'flashcard_deck', labelKey: 'blocks.types.flashcardDeck', icon: '🗂️' },
  { value: 'faq', labelKey: 'blocks.types.faq', icon: '💡' },
  { value: 'summary', labelKey: 'blocks.types.summary', icon: '📝' },
  { value: 'takeaways', labelKey: 'blocks.types.takeaways', icon: '⭐' },
  { value: 'mermaid', labelKey: 'blocks.types.mermaid', icon: '🧩' },
  { value: 'graph', labelKey: 'blocks.types.graph', icon: '🕸️' },
  { value: 'divider', labelKey: 'blocks.types.divider', icon: '—' }
];

const aiContentTypeIds = [
  'notes',
  'flashcards',
  'quiz',
  'tables',
  'timeline',
  'diagrams',
  'lists',
  'definitions',
  'faq',
  'summary',
  'takeaways',
  'steps'
] as const;
type AiContentType = (typeof aiContentTypeIds)[number];

type AiSource = {
  id: string;
  type: 'file' | 'text';
  label: string;
  content: string;
};

const MAX_SOURCE_LABEL_CHARS = 28;

function getFileExtension(filename: string): string | null {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === filename.length - 1) return null;
  return filename.slice(lastDot + 1).toLowerCase();
}

function truncateFileName(filename: string, maxChars: number): string {
  if (filename.length <= maxChars) return filename;
  const lastDot = filename.lastIndexOf('.');
  if (lastDot > 0 && lastDot < filename.length - 1) {
    const base = filename.slice(0, lastDot);
    const ext = filename.slice(lastDot);
    const baseMax = maxChars - ext.length - 3;
    if (baseMax > 0) {
      return `${base.slice(0, baseMax)}...${ext}`;
    }
    return filename;
  }
  return `${filename.slice(0, Math.max(1, maxChars - 3))}...`;
}

function getSourceIcon(source: AiSource): string {
  if (source.type !== 'file') return '✍️';
  const ext = getFileExtension(source.label || '');
  switch (ext) {
    case 'pdf':
      return '📕';
    case 'docx':
      return '📃';
    case 'md':
      return '📝';
    case 'txt':
      return '📄';
    default:
      return '📎';
  }
}

function getSourceDisplayLabel(source: AiSource, t: ReturnType<typeof useTranslations>): string {
  if (source.type === 'text') {
    return t('ai.sources.textLabel');
  }
  const raw = source.label || t('ai.sources.fileLabel');
  return truncateFileName(raw, MAX_SOURCE_LABEL_CHARS);
}

function getDefaultContent(type: BlockType) {
  switch (type) {
    case 'heading':
      return { level: 1, text: '', subtitle: '' };
    case 'paragraph':
      return { text: '', size: 'md', tone: 'normal', align: 'left' };
    case 'quote':
      return { text: '', author: '', source: '' };
    case 'callout':
      return { variant: 'info', title: '', text: '' };
    case 'list':
      return { ordered: false, items: [''], nested: false };
    case 'checklist':
      return { items: [{ text: '', checked: false }] };
    case 'definitions':
      return { items: [{ term: '', definition: '' }] };
    case 'code':
      return { language: 'plaintext', code: '' };
    case 'image':
      return { url: '', alt: '', caption: '', size: 'md', align: 'center' };
    case 'attachment':
      return { attachment_id: null, display_name: '', file_type: '', file_size: 0 };
    case 'divider':
      return { label: '', style: 'line' };
    case 'table':
      return { columns: ['Column 1'], rows: [['']], caption: '' };
    case 'timeline':
      return { items: [{ title: '', description: '', order: '' }] };
    case 'steps':
      return { steps: [{ title: '', description: '' }] };
    case 'quiz':
      return { question: '', options: [''], correctIndex: undefined, explanation: '' };
    case 'flashcard':
      return { front: '', back: '' };
    case 'flashcard_deck':
      return { cards: [{ front: '', back: '' }] };
    case 'faq':
      return { items: [{ question: '', answer: '' }] };
    case 'summary':
      return { text: '' };
    case 'takeaways':
      return { items: [''] };
    case 'mermaid':
      return { code: '' };
    case 'graph':
      return { nodes: [{ id: '', label: '' }], edges: [{ from: '', to: '', label: '' }] };
    default:
      return {};
  }
}

function getInsertPosition(blocks: BlockItem[], index: number) {
  if (blocks.length === 0) return 0;
  const prev = blocks[index - 1];
  const next = blocks[index];
  if (!prev && next) return next.position - 1;
  if (prev && !next) return prev.position + 1;
  if (prev && next) return (prev.position + next.position) / 2;
  return blocks[blocks.length - 1].position + 1;
}

const knownUntitledTitles = [
  'Untitled',
  'Untitled page',
  'Unbenannt',
  'Unbenannte Seite',
  'Без назви',
  'Сторінка без назви'
];

function isUntitledTitle(value: string | null | undefined, fallback: string) {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  if (knownUntitledTitles.some((title) => title.toLowerCase() === normalized)) {
    return true;
  }
  return normalized === fallback.trim().toLowerCase();
}

function deriveTitleFromBlocks(blocks: BlockItem[]) {
  const pickText = (block: BlockItem) => {
    const content = block.content || {};
    switch (block.type) {
      case 'heading':
      case 'paragraph':
      case 'quote':
      case 'summary':
        return content.text;
      case 'callout':
        return content.title || content.text;
      case 'list': {
        const first = Array.isArray(content.items) ? content.items[0] : '';
        return typeof first === 'string' ? first.split('::')[0] : '';
      }
      case 'checklist': {
        const first = Array.isArray(content.items) ? content.items[0]?.text : '';
        return first;
      }
      case 'definitions': {
        const first = Array.isArray(content.items) ? content.items[0]?.term : '';
        return first;
      }
      case 'table':
        return content.caption || (Array.isArray(content.rows) ? content.rows[0]?.[0] : '');
      case 'timeline':
        return Array.isArray(content.items) ? content.items[0]?.title : '';
      case 'steps':
        return Array.isArray(content.steps) ? content.steps[0]?.title : '';
      case 'faq':
        return Array.isArray(content.items) ? content.items[0]?.question : '';
      case 'takeaways': {
        const first = Array.isArray(content.items) ? content.items[0] : '';
        return first;
      }
      case 'image':
        return content.caption || content.alt;
      default:
        return '';
    }
  };

  for (const block of blocks) {
    const text = pickText(block);
    if (typeof text === 'string' && text.trim()) {
      const words = text.trim().split(/\s+/);
      const slice = words.slice(0, 3).join(' ');
      return words.length > 3 ? `${slice}...` : slice;
    }
  }
  return '';
}

function getBlockColorToken(block: BlockItem): string | undefined {
  const content = block.content || {};
  return (content.color_token ?? content.colorToken) as string | undefined;
}

function SortableRow({
  block,
  children,
  enabled
}: {
  block: BlockItem;
  children: (props: {
    dragHandleProps?: {
      listeners: ReturnType<typeof useSortable>['listeners'];
      setActivatorNodeRef: (element: HTMLElement | null) => void;
    };
  }) => React.ReactNode;
  enabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: block.logical_id, disabled: !enabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} className={isDragging ? 'opacity-70' : ''}>
      {children(
        enabled
          ? {
              dragHandleProps: {
                listeners,
                setActivatorNodeRef
              }
            }
          : {}
      )}
    </div>
  );
}

export default function PageView() {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params?.slug as string;
  const locale = pathname.split('/')[1] || 'en';
  const { session, user, supabase, signOut } = useAuth();

  const [page, setPage] = useState<PageItem | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [title, setTitle] = useState('');
  const [blocks, setBlocks] = useState<BlockItem[]>([]);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBlocksLoading, setIsBlocksLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [originalTitle, setOriginalTitle] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, any>>>({});
  const [addIndex, setAddIndex] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
  const [downloadErrorId, setDownloadErrorId] = useState<string | null>(null);
  const [pendingInsertIndex, setPendingInsertIndex] = useState<number | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLanguage, setAiLanguage] = useState<string>('en');
  const [aiContentTypes, setAiContentTypes] = useState<Record<AiContentType, boolean>>({
    notes: true,
    flashcards: true,
    quiz: true,
    tables: true,
    timeline: true,
    diagrams: true,
    lists: true,
    definitions: true,
    faq: true,
    summary: true,
    takeaways: true,
    steps: true
  });
  const [aiUsePageContext, setAiUsePageContext] = useState(true);
  const [aiSources, setAiSources] = useState<AiSource[]>([]);
  const [aiSourceInput, setAiSourceInput] = useState('');
  const [aiManualError, setAiManualError] = useState<string | null>(null);
  const [aiTempFileError, setAiTempFileError] = useState<string | null>(null);
  const [aiUploadingSource, setAiUploadingSource] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiToast, setAiToast] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const [savingBlockId, setSavingBlockId] = useState<string | null>(null);
  const [addMenuPlacement, setAddMenuPlacement] = useState<'above' | 'below'>('below');
  const [addMenuMaxHeight, setAddMenuMaxHeight] = useState<number | null>(null);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileReorderMode, setMobileReorderMode] = useState(false);
  const [swipeOpen, setSwipeOpen] = useState<Record<string, boolean>>({});
  const [reorderSheetOpen, setReorderSheetOpen] = useState(false);
  const [reorderTargetId, setReorderTargetId] = useState<string | null>(null);
  const [aiLangMenuOpen, setAiLangMenuOpen] = useState(false);
  const [aiDragActive, setAiDragActive] = useState(false);
  const [aiLangMenuPos, setAiLangMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const historyRef = useRef<BlockItem[][]>([]);
  const redoRef = useRef<BlockItem[][]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastFileRef = useRef<File | null>(null);
  const lastInsertIndexRef = useRef<number | null>(null);
  const aiBlockRef = useRef<HTMLDivElement | null>(null);
  const aiTempFileInputRef = useRef<HTMLInputElement | null>(null);
  const aiLangButtonRef = useRef<HTMLButtonElement | null>(null);
  const deleteHoldRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor)
  );

  const token = session?.access_token;
  const isOwner = !!user && !!page?.owner_id && page.owner_id === user.id;
  const isReadOnly = !isOwner;
  const canUseAi = isOwner;
  const canUpload = editMode && isOwner && !isUploading;
  const attachmentsMap = useMemo(
    () => new Map(attachments.map((item) => [item.id, item])),
    [attachments]
  );
  const breadcrumbs = useMemo(() => {
    if (!page || pages.length === 0) return [];
    const byId = new Map(pages.map((item) => [item.id, item]));
    const chain: PageItem[] = [];
    let current: PageItem | undefined = page;
    const guard = new Set<string>();
    while (current && !guard.has(current.id)) {
      chain.unshift(current);
      guard.add(current.id);
      if (!current.parent_page_id) break;
      current = byId.get(current.parent_page_id);
    }
    return chain;
  }, [page, pages]);

  const allowedExtensions = new Set(['pdf', 'docx', 'md', 'txt', 'png', 'jpg', 'jpeg', 'webp']);
  const allowedMimeTypes = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]);
  const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

  const getAuthToken = async () => {
    if (session?.access_token) return session.access_token;
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      return data.session.access_token;
    }
    const refreshed = await supabase.auth.refreshSession();
    return refreshed.data.session?.access_token || null;
  };

  const handleUnauthorized = async (response: Response) => {
    if (response.status === 401) {
      await signOut();
      return true;
    }
    return false;
  };

  const loadPage = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const fetchPublic = async () => {
        const response = await fetch(`/api/public/pages/${slug}`);
        if (!response.ok) {
          throw new Error(t('pages.errors.load'));
        }
        const data = await response.json();
        const found = data.page || null;
        setPages(found ? [found] : []);
        setPage(found);
        setBlocks(data.blocks || []);
        setAttachments(data.attachments || []);
        setIsBlocksLoading(false);
        const nextTitle = found?.title || '';
        setOriginalTitle(nextTitle);
        if (
          isUntitledTitle(nextTitle, t('pages.untitledDisplay')) ||
          knownUntitledTitles.includes(nextTitle)
        ) {
          setTitle(t('pages.untitledDisplay'));
        } else {
          setTitle(nextTitle);
        }
      };

      if (!token) {
        await fetchPublic();
        return;
      }

      const response = await fetch('/api/pages', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (await handleUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(t('pages.errors.load'));
      }
      const data = await response.json();
      const allPages = data.pages || [];
      const found = allPages.find((p: PageItem) => p.slug === slug) || null;
      if (!found) {
        await fetchPublic();
        return;
      }
      setPages(allPages);
      setPage(found);
      if (found) {
        setBlocks([]);
        setIsBlocksLoading(true);
      }
      const nextTitle = found?.title || '';
      setOriginalTitle(nextTitle);
      if (
        isUntitledTitle(nextTitle, t('pages.untitledDisplay')) ||
        knownUntitledTitles.includes(nextTitle)
      ) {
        setTitle(t('pages.untitledDisplay'));
      } else {
        setTitle(nextTitle);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('pages.errors.load'));
      setPage(null);
    } finally {
      setIsLoading(false);
    }
  };

  const loadBlocks = async (pageId: string) => {
    if (!token) return;
    try {
      const response = await fetch(`/api/blocks?pageId=${pageId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (await handleUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(t('blocks.errors.load'));
      }
      const data = await response.json();
      setBlocks(data.blocks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('blocks.errors.load'));
    }
  };

  const loadAttachments = async (pageId: string, includeParsed = false) => {
    if (!token) return;
    try {
      setAttachmentsError(null);
      const response = await fetch(
        `/api/attachments?pageId=${pageId}${includeParsed ? '&includeParsed=1' : ''}`,
        {
        headers: { Authorization: `Bearer ${token}` }
        }
      );
      if (await handleUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(t('blocks.attachments.listFailed'));
      }
      const data = await response.json();
      setAttachments(data.attachments || []);
    } catch (err) {
      console.error('Failed to load attachments:', err);
      setAttachments([]);
      setAttachmentsError(t('blocks.attachments.listFailed'));
    }
  };

  useEffect(() => {
    loadPage();
  }, [slug, token]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 1023px)');
    const update = () => setIsMobile(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener('change', update);
    } else {
      media.addListener(update);
    }
    return () => {
      if (media.removeEventListener) {
        media.removeEventListener('change', update);
      } else {
        media.removeListener(update);
      }
    };
  }, []);

  useEffect(() => {
    if (!page) return;
    if (!token) return;
    setBlocks([]);
    setIsBlocksLoading(true);
    loadBlocks(page.id).finally(() => setIsBlocksLoading(false));
    loadAttachments(page.id);
  }, [page?.id, token]);

  useEffect(() => {
    if (!page?.id) return;
    if (!token) return;
    const run = async () => {
      const authToken = await getAuthToken();
      if (!authToken) return;
      await fetch(`/api/pages/${page.id}/access`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` }
      }).catch(() => {});
    };
    run();
  }, [page?.id]);

  useEffect(() => {
    if (!page) return;
    const isUntitled =
      isUntitledTitle(page.title, t('pages.untitledDisplay')) ||
      page.title === t('pages.newPageTitle');
    if (!isUntitled) return;
    if (blocks.length === 0) return;
    const derived = deriveTitleFromBlocks(blocks);
    if (!derived) return;
    if (derived === title) return;
    handleRename(derived);
  }, [blocks, page?.id]);

  useEffect(() => {
    if (!page || !aiOpen) return;
    if (!token) return;
    loadAttachments(page.id, true);
  }, [aiOpen, page?.id, token]);

  useEffect(() => {
    if (!canUseAi) {
      setAiOpen(false);
      return;
    }
    const openFromQuery = searchParams.get('ai') === '1';
    setAiOpen(openFromQuery);
    setAiLanguage('en');
    setAiContentTypes({
      notes: true,
      flashcards: true,
      quiz: true,
      tables: true,
      timeline: true,
      diagrams: true,
      lists: true,
      definitions: true,
      faq: true,
      summary: true,
      takeaways: true,
      steps: true
    });
    setAiUsePageContext(true);
    setAiSources([]);
    setAiSourceInput('');
    setAiManualError(null);
    setAiTempFileError(null);
  }, [page?.id, searchParams, canUseAi]);

  useEffect(() => {
    if (!aiOpen) return;
    aiBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [aiOpen]);

  useEffect(() => {
    if (!aiLangMenuOpen) return;
    const updatePosition = () => {
      const rect = aiLangButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setAiLangMenuPos({
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width
      });
    };
    const handleClick = () => setAiLangMenuOpen(false);
    updatePosition();
    window.addEventListener('click', handleClick);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [aiLangMenuOpen]);

  useEffect(() => {
    if (!editMode) {
      setEditingId(null);
      setActiveBlockId(null);
      setDrafts({});
      setAddIndex(null);
      setMobileReorderMode(false);
    }
  }, [editMode]);

  useEffect(() => {
    if (!isReadOnly) return;
    setEditMode(false);
    setAiOpen(false);
  }, [isReadOnly]);

  useEffect(() => {
    if (addIndex === null) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-add-block-control]')) {
        return;
      }
      setAddIndex(null);
    };
    document.addEventListener('click', handleClickOutside, true);
    return () => document.removeEventListener('click', handleClickOutside, true);
  }, [addIndex]);

  useEffect(() => {
    if (addIndex === null) return;
    const updatePlacement = () => {
      const control = document.querySelector(
        `[data-add-block-control="${addIndex}"]`
      ) as HTMLElement | null;
      const menu = document.querySelector('[data-add-block-menu="true"]') as HTMLElement | null;
      if (!control || !menu) return;
      const controlRect = control.getBoundingClientRect();
      const menuHeight = menu.offsetHeight;
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - controlRect.bottom;
      const spaceAbove = controlRect.top;
      const placeAbove = spaceBelow < menuHeight + 16 && spaceAbove > spaceBelow;
      setAddMenuPlacement(placeAbove ? 'above' : 'below');
      const available = (placeAbove ? spaceAbove : spaceBelow) - 16;
      if (available > 0) {
        setAddMenuMaxHeight(Math.max(120, available));
      }
    };
    const raf = window.requestAnimationFrame(updatePlacement);
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [addIndex]);

  useEffect(() => {
    if (!isMobile) return;
    let lastY = window.scrollY;
    const handleScroll = () => {
      const current = window.scrollY;
      const delta = current - lastY;
      if (delta > 12) {
        setIsHeaderHidden(true);
      } else if (delta < -8) {
        setIsHeaderHidden(false);
      }
      lastY = current;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isMobile]);

  useEffect(() => {
    return () => {
      if (deleteHoldRef.current) {
        window.clearTimeout(deleteHoldRef.current);
      }
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (aiGenerating) {
      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = previous;
      };
    }
    document.body.style.overflow = '';
  }, [aiGenerating]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!editMode) return;
      const isUndo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !event.shiftKey;
      const isRedo =
        (event.metaKey || event.ctrlKey) &&
        (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey));

      if (isUndo) {
        event.preventDefault();
        const previous = historyRef.current.pop();
        if (previous) {
          redoRef.current.push(blocks);
          setBlocks(previous);
        }
      }

      if (isRedo) {
        event.preventDefault();
        const next = redoRef.current.pop();
        if (next) {
          historyRef.current.push(blocks);
          setBlocks(next);
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [blocks, editMode]);

  const pushHistory = (snapshot: BlockItem[]) => {
    historyRef.current.push(snapshot);
    redoRef.current = [];
  };

  const handleRename = async (nextTitle?: string) => {
    if (!page || !isOwner) return;
    const trimmed = (nextTitle ?? title).trim();
    if (!trimmed) return;
    if (
      isUntitledTitle(originalTitle, t('pages.untitledDisplay')) &&
      trimmed === t('pages.untitledDisplay')
    ) {
      return;
    }
    if (trimmed === originalTitle) return;

    try {
      setIsSaving(true);
      if (nextTitle) {
        setTitle(trimmed);
      }
      const authToken = await getAuthToken();
      if (!authToken) {
        throw new Error(t('pages.errors.rename'));
      }
      const response = await fetch(`/api/pages/${page.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ title: trimmed })
      });
      if (await handleUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(t('pages.errors.rename'));
      }
      const data = await response.json();
      setPage(data.page);
      setOriginalTitle(data.page.title || '');
      if (data.page.title === 'Без назви') {
        setTitle(t('pages.untitledDisplay'));
      } else {
        setTitle(data.page.title || '');
      }
      window.dispatchEvent(new Event('pages:refresh'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('pages.errors.rename'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!page || !isOwner) return;
    const confirmed = window.confirm(t('pages.deleteConfirm'));
    if (!confirmed) return;

    try {
      const authToken = await getAuthToken();
      if (!authToken) {
        throw new Error(t('pages.errors.delete'));
      }
      const response = await fetch(`/api/pages/${page.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (await handleUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(t('pages.errors.delete'));
      }
      window.dispatchEvent(new Event('pages:refresh'));
      router.replace(`/${locale}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('pages.errors.delete'));
    }
  };

  const handleCreateChild = async () => {
    if (!page || !isOwner) return;
    try {
      const authToken = await getAuthToken();
      if (!authToken) {
        throw new Error(t('pages.errors.create'));
      }
      const response = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          title: t('pages.newPageTitle'),
          parent_page_id: page.id
        })
      });
      if (await handleUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(t('pages.errors.create'));
      }
      const data = await response.json();
      const created = data.page as PageItem;
      window.dispatchEvent(new Event('pages:refresh'));
      router.push(`/${locale}/pages/${created.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('pages.errors.create'));
    }
  };

  const handleExportPdf = async () => {
    if (!page) return;
    try {
      setIsExporting(true);
      setExportToast(null);
      const authToken = await getAuthToken();
      if (!authToken) {
        throw new Error('Unauthorized');
      }
      const response = await fetch('/api/export/pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ page_id: page.id, locale })
      });
      if (await handleUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error('Export failed');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${page.title || 'page'}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      setExportToast('Failed to export PDF');
      window.setTimeout(() => setExportToast(null), 3000);
    } finally {
      setIsExporting(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!page || !isOwner) return;
    const authToken = await getAuthToken();
    if (!authToken) return;
    const isFavorite = !!page.is_favorite;
    const response = await fetch(`/api/pages/${page.id}/favorite`, {
      method: isFavorite ? 'DELETE' : 'POST',
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (await handleUnauthorized(response)) return;
    if (!response.ok) return;
    const data = await response.json();
    const nextFavorite = !!data.page?.is_favorite;
    setPage((prev) => (prev ? { ...prev, is_favorite: nextFavorite } : prev));
    setPages((prev) =>
      prev.map((item) => (item.id === page.id ? { ...item, is_favorite: nextFavorite } : item))
    );
    window.dispatchEvent(new Event('pages:refresh'));
    window.dispatchEvent(new Event('dashboard:refresh'));
  };

  const handleAddBlock = async (index: number, type: BlockType) => {
    if (!page) return;
    const position = getInsertPosition(blocks, index);
    const content = getDefaultContent(type);
    pushHistory([...blocks]);
    try {
      const authToken = await getAuthToken();
      if (!authToken) {
        throw new Error(t('blocks.errors.create'));
      }
      const response = await fetch('/api/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          page_id: page.id,
          type,
          content,
          position
        })
      });
      if (await handleUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(t('blocks.errors.create'));
      }
      const data = await response.json();
      const newBlock = data.block as BlockItem;
      setBlocks((prev) => [...prev, newBlock].sort((a, b) => a.position - b.position));
      setAddIndex(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('blocks.errors.create'));
    }
  };

  const renderAddBlockControl = (index: number) => {
    if (!editMode) return null;
    const isOpen = addIndex === index;
    return (
      <div
        className="group relative flex items-center justify-center py-4"
        data-add-block-control={index}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setAddIndex(null);
          }
        }}
      >
        <button
          type="button"
          aria-label={t('blocks.add')}
          onClick={() => setAddIndex(isOpen ? null : index)}
          className="relative h-6 w-full"
        >
          <span className="pointer-events-none absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-cyan-400/40 opacity-100 transition lg:bg-transparent lg:opacity-0 lg:group-hover:opacity-100 lg:group-hover:bg-cyan-400/40" />
          <span className="pointer-events-none absolute left-1/2 top-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-cyan-400/50 bg-black/60 text-xs text-cyan-200 opacity-100 shadow-[0_0_12px_rgba(34,211,238,0.5)] transition lg:opacity-0 lg:group-hover:opacity-100">
            <motion.span
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 1.8, repeat: Infinity }}
              className="inline-flex"
            >
              +
            </motion.span>
          </span>
        </button>

        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            data-add-block-menu="true"
            style={addMenuMaxHeight ? { maxHeight: `${addMenuMaxHeight}px` } : undefined}
            className={`absolute z-20 w-64 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-2 shadow-[0_20px_60px_rgba(2,6,23,0.25)] backdrop-blur-2xl overflow-y-auto ${
              addMenuPlacement === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'
            }`}
          >
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  if (!canUpload) return;
                  setAddIndex(null);
                  handleUploadClick(index);
                }}
                disabled={!canUpload}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                  canUpload
                    ? 'text-foreground hover:bg-white/5'
                    : 'text-muted cursor-not-allowed'
                }`}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-xs font-semibold">
                  📎
                </span>
                <span>
                  {canUpload ? t('blocks.attachments.upload') : t('blocks.attachments.uploadDisabled')}
                </span>
              </button>
              {blockTypes.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => handleAddBlock(index, type.value)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-foreground hover:bg-white/5 transition"
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-xs font-semibold">
                    {type.icon}
                  </span>
                  <span>{t(type.labelKey)}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    );
  };

  const handleEditBlock = (block: BlockItem) => {
    setEditingId(block.logical_id);
    setDrafts((prev) => ({ ...prev, [block.logical_id]: { ...block.content } }));
  };

  const handleCancelEdit = (block: BlockItem) => {
    setEditingId(null);
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[block.logical_id];
      return next;
    });
  };

  const handleSaveBlock = async (block: BlockItem) => {
    const authToken = await getAuthToken();
    if (!authToken) {
      setError(t('blocks.errors.save'));
      return;
    }
    const draft = drafts[block.logical_id] || block.content;
    pushHistory([...blocks]);
    setSavingBlockId(block.logical_id);
    try {
      const response = await fetch(`/api/blocks/${block.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ content: draft })
      });
      if (await handleUnauthorized(response)) return;
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || t('blocks.errors.save'));
      }
      const data = await response.json();
      const updated = data.block as BlockItem;
      setBlocks((prev) =>
        prev.map((item) => (item.logical_id === block.logical_id ? updated : item))
      );
      setEditingId(null);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[block.logical_id];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('blocks.errors.save'));
    } finally {
      setSavingBlockId((current) => (current === block.logical_id ? null : current));
    }
  };

  const handleDeleteBlock = async (block: BlockItem) => {
    const authToken = await getAuthToken();
    if (!authToken) return;
    if (block.type === 'attachment' && !isOwner) return;
    const confirmed = window.confirm(t('blocks.deleteConfirm'));
    if (!confirmed) return;

    if (block.type === 'attachment' && block.content?.attachment_id) {
      try {
        const response = await fetch(`/api/attachments/${block.content.attachment_id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${authToken}` }
        });
        if (await handleUnauthorized(response)) return;
        if (!response.ok) {
          throw new Error(t('blocks.errors.delete'));
        }
        setAttachments((prev) => prev.filter((item) => item.id !== block.content.attachment_id));
      } catch (err) {
        setError(err instanceof Error ? err.message : t('blocks.errors.delete'));
        return;
      }
    }

    pushHistory([...blocks]);
    try {
      const response = await fetch(`/api/blocks/${block.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (await handleUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(t('blocks.errors.delete'));
      }
      setBlocks((prev) => prev.filter((item) => item.logical_id !== block.logical_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('blocks.errors.delete'));
    }
  };

  const handleDeleteHoldStart = (block: BlockItem) => {
    if (!editMode) return;
    if (deleteHoldRef.current) {
      window.clearTimeout(deleteHoldRef.current);
    }
    deleteHoldRef.current = window.setTimeout(() => {
      handleDeleteBlock(block);
    }, 650);
  };

  const handleDeleteHoldCancel = () => {
    if (deleteHoldRef.current) {
      window.clearTimeout(deleteHoldRef.current);
      deleteHoldRef.current = null;
    }
  };

  const formatFileSize = (size: number) => {
    if (!size) return '';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getAttachmentIcon = (fileType: string) => {
    if (fileType.includes('pdf')) return '📄';
    if (fileType.includes('word')) return '📝';
    if (fileType.includes('markdown')) return '🧾';
    if (fileType.includes('text')) return '🗒️';
    if (fileType.includes('image')) return '🖼️';
    return '📎';
  };

  const getSignedUrlForAttachment = async (attachmentId: string) => {
    if (!page) return null;
    const authToken = await getAuthToken();
    if (!authToken) return null;
    const response = await fetch(`/api/attachments?pageId=${page.id}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (await handleUnauthorized(response)) return null;
    if (!response.ok) return null;
    const data = await response.json();
    const next = data.attachments || [];
    setAttachments(next);
    const match = next.find((item: AttachmentItem) => item.id === attachmentId);
    return match?.signed_url || null;
  };

  const handleDownloadAttachment = async (attachmentId: string) => {
    setDownloadErrorId(null);
    const current = attachmentsMap.get(attachmentId);
    const signedUrl = current?.signed_url || (await getSignedUrlForAttachment(attachmentId));
    if (signedUrl) {
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    setDownloadErrorId(attachmentId);
  };

  const validateUploadFile = (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!allowedExtensions.has(extension)) {
      return t('blocks.attachments.unsupportedType');
    }
    if (file.type && !allowedMimeTypes.has(file.type)) {
      return t('blocks.attachments.unsupportedType');
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return t('blocks.attachments.fileTooLarge');
    }
    return null;
  };

  const createAttachmentBlock = async (attachment: AttachmentItem, insertIndex: number) => {
    if (!page) return;
    const position = getInsertPosition(blocks, insertIndex);
    pushHistory([...blocks]);
    const authToken = await getAuthToken();
    if (!authToken) return;
    const response = await fetch('/api/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        page_id: page.id,
        type: 'attachment',
        content: {
          attachment_id: attachment.id,
          display_name: attachment.filename,
          file_type: attachment.file_type,
          file_size: attachment.file_size
        },
        position
      })
    });

    if (await handleUnauthorized(response)) return;
    if (!response.ok) {
      await fetch(`/api/attachments/${attachment.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      throw new Error(t('blocks.errors.create'));
    }

    const data = await response.json();
    const newBlock = data.block as BlockItem;
    setBlocks((prev) => [...prev, newBlock].sort((a, b) => a.position - b.position));
    setAddIndex(null);
  };

  const uploadAttachment = async (file: File, insertIndex: number) => {
    if (!page) return;
    setUploadError(null);
    setUploadProgress(0);
    setIsUploading(true);

    try {
      const authToken = await getAuthToken();
      if (!authToken) {
        throw new Error(t('blocks.attachments.uploadFailed'));
      }
      const formData = new FormData();
      formData.append('file', file);
      formData.append('page_id', page.id);

      const response = await new Promise<{ attachment: AttachmentItem }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/attachments');
        xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        };
        xhr.onerror = () => reject(new Error(t('blocks.attachments.uploadFailed')));
        xhr.onload = async () => {
          if (xhr.status === 401) {
            await signOut();
            reject(new Error('Unauthorized'));
            return;
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              reject(new Error(t('blocks.attachments.uploadFailed')));
            }
          } else {
            try {
              const payload = JSON.parse(xhr.responseText || '{}');
              reject(new Error(payload.error || t('blocks.attachments.uploadFailed')));
            } catch {
              reject(new Error(t('blocks.attachments.uploadFailed')));
            }
          }
        };
        xhr.send(formData);
      });

      if (response?.attachment) {
        await createAttachmentBlock(response.attachment, insertIndex);
        await loadAttachments(page.id);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t('blocks.attachments.uploadFailed'));
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleUploadClick = (insertIndex: number) => {
    setPendingInsertIndex(insertIndex);
    fileInputRef.current?.click();
  };

  const handleFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const insertIndex = pendingInsertIndex ?? blocks.length;
    lastFileRef.current = file;
    lastInsertIndexRef.current = insertIndex;
    const validationError = validateUploadFile(file);
    if (validationError) {
      setUploadError(validationError);
      event.target.value = '';
      return;
    }
    await uploadAttachment(file, insertIndex);
    setPendingInsertIndex(null);
    event.target.value = '';
  };

  const handleRetryUpload = async () => {
    if (!lastFileRef.current) return;
    const insertIndex = lastInsertIndexRef.current ?? blocks.length;
    await uploadAttachment(lastFileRef.current, insertIndex);
  };

  const renderAttachmentBlock = (block: BlockItem) => {
    const attachmentId = block.content?.attachment_id as string | undefined;
    const attachment = attachmentId ? attachmentsMap.get(attachmentId) : null;
    const hasAccess = !!attachment;
    const displayName =
      block.content?.display_name ||
      attachment?.filename ||
      t('blocks.attachments.fallbackName');
    const fileType = (block.content?.file_type || attachment?.file_type || '').toString();
    const fileSize = block.content?.file_size || attachment?.file_size || 0;
    const showDownloadError = downloadErrorId === attachmentId;

    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/30 bg-black/40 text-xl text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.45)]">
              {getAttachmentIcon(fileType)}
            </span>
            <div className="space-y-0.5">
              <div className="text-sm font-semibold text-gray-100">{displayName}</div>
              <div className="text-xs font-mono text-slate-400">
                {fileType || t('blocks.attachments.unknownType')}
                {fileSize ? ` • ${formatFileSize(fileSize)}` : ''}
                {!hasAccess && attachmentId ? ` • ${t('blocks.attachments.noAccess')}` : ''}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => attachmentId && handleDownloadAttachment(attachmentId)}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-cyan-400/40 hover:text-white disabled:opacity-50"
            disabled={!attachmentId || !hasAccess}
          >
            {t('blocks.attachments.download')}
          </button>
        </div>
        {showDownloadError && (
          <div className="mt-2 text-xs text-slate-400">
            {t('blocks.attachments.downloadUnavailable')}
          </div>
        )}
      </div>
    );
  };

  const handleDragEnd = async (event: any) => {
    if (!editMode) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = blocks.findIndex((b) => b.logical_id === active.id);
    const newIndex = blocks.findIndex((b) => b.logical_id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const previousBlocks = [...blocks];
    const reordered = arrayMove(previousBlocks, oldIndex, newIndex);
    const updated = reordered.map((block, index) => ({
      ...block,
      position: getInsertPosition(reordered, index)
    }));

    pushHistory(previousBlocks);
    setBlocks(updated);

    if (!page) return;
    const authToken = await getAuthToken();
    if (!authToken) {
      setBlocks(previousBlocks);
      return;
    }

    const updates = updated.map((block) => ({
      logical_id: block.logical_id,
      position: block.position
    }));

    try {
      const response = await fetch('/api/blocks/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ page_id: page.id, updates })
      });
      if (await handleUnauthorized(response)) {
        setBlocks(previousBlocks);
        return;
      }
      if (!response.ok) {
        throw new Error(t('blocks.errors.reorder'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('blocks.errors.reorder'));
      setBlocks(previousBlocks);
    }
  };

  const renderBlockContent = (block: BlockItem) => {
    const isInteractive =
      block.type === 'flashcard' || block.type === 'flashcard_deck' || block.type === 'quiz';
    const content = (() => {
      switch (block.type) {
      case 'heading':
        {
          const level = Number(block.content.level) || 1;
          const headingSize =
            level === 1
              ? 'text-3xl sm:text-4xl lg:text-5xl'
              : level === 2
              ? 'text-2xl sm:text-3xl lg:text-4xl'
              : level === 3
              ? 'text-xl sm:text-2xl lg:text-3xl'
              : level === 4
              ? 'text-lg sm:text-xl lg:text-2xl'
              : 'text-base sm:text-lg lg:text-xl';
          const textContent = block.content.text || t('blocks.placeholders.heading');
          const hasSpans = Array.isArray(block.content.spans) && block.content.spans.length > 0;
          const headingColorToken = getBlockColorToken(block);
          const headingColorClass = headingColorToken ? `token-${headingColorToken}` : '';
          const inner = (
            <div className="space-y-2">
              <div
                className={`font-semibold ${headingColorToken ? headingColorClass : 'text-foreground'} ${headingSize}`}
              >
                {hasSpans ? (
                  <TextWithSpans text={textContent} spans={block.content.spans} />
                ) : (
                  textContent
                )}
              </div>
              {block.content.subtitle ? (
                <div className="text-sm text-muted">{block.content.subtitle}</div>
              ) : null}
            </div>
          );
          return inner;
        }
      case 'paragraph':
        {
          const size = block.content.size || 'md';
          const tone = block.content.tone || 'normal';
          const align = block.content.align || 'left';
          const sizeClass =
            size === 'xs'
              ? 'text-xs sm:text-sm'
              : size === 'sm'
              ? 'text-sm sm:text-base'
              : size === 'lg'
              ? 'text-lg sm:text-xl'
              : 'text-base sm:text-lg';
          const toneClass =
            tone === 'muted'
              ? 'text-muted'
              : tone === 'lead'
              ? 'text-foreground'
              : 'text-foreground/90';
          const alignClass = align === 'center' ? 'text-center' : 'text-left';
          const textContent = block.content.text || t('blocks.placeholders.paragraph');
          const hasSpans = Array.isArray(block.content.spans) && block.content.spans.length > 0;
          const paragraphColorToken = getBlockColorToken(block);
          const paragraphColorClass = paragraphColorToken ? `token-${paragraphColorToken}` : '';
          const paragraphInner = (
            <p
              className={`leading-relaxed ${sizeClass} ${paragraphColorToken ? paragraphColorClass : toneClass} ${alignClass}`}
            >
              {hasSpans ? (
                <TextWithSpans text={textContent} spans={block.content.spans} />
              ) : (
                textContent
              )}
            </p>
          );
          return paragraphInner;
        }
      case 'quote':
        return (
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-4">
            <blockquote className="text-foreground/90 italic">
              {block.content.text || t('blocks.placeholders.quote')}
            </blockquote>
            {(block.content.author || block.content.source) && (
              <div className="mt-2 text-xs text-muted">
                {block.content.author ? block.content.author : t('blocks.placeholders.quoteAuthor')}
                {block.content.source ? ` • ${block.content.source}` : ''}
              </div>
            )}
          </div>
        );
      case 'callout':
        {
          const colorToken = getBlockColorToken(block);
          const variant = block.content.variant || 'info';
          const variantClass = colorToken
            ? `callout-token-${colorToken}`
            : variant === 'warning'
            ? 'border-amber-400/40 bg-amber-500/10'
            : variant === 'tip'
            ? 'border-emerald-400/40 bg-emerald-500/10'
            : variant === 'example'
            ? 'border-indigo-400/40 bg-indigo-500/10'
            : variant === 'definition'
            ? 'border-sky-400/40 bg-sky-500/10'
            : variant === 'summary'
            ? 'border-purple-400/40 bg-purple-500/10'
            : 'border-[color:var(--border)] bg-[color:var(--surface-2)]';
          const textContent = block.content.text || t('blocks.placeholders.callout');
          const hasSpans = Array.isArray(block.content.spans) && block.content.spans.length > 0;
          return (
            <div className={`rounded-xl border p-3 text-sm ${colorToken ? '' : 'text-foreground'} ${variantClass}`}>
              {block.content.title ? (
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                  {block.content.title}
                </div>
              ) : null}
              {hasSpans ? (
                <TextWithSpans text={textContent} spans={block.content.spans} />
              ) : (
                textContent
              )}
            </div>
          );
        }
      case 'code':
        return (
          <div className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-black/70">
            <div className="flex items-center gap-2 border-b border-white/10 bg-black/60 px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-300/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-green-400/60" />
              <span className="ml-2 text-xs text-muted">{block.content.language || 'plaintext'}</span>
            </div>
            <pre className="p-4 text-sm font-mono text-cyan-100/90 overflow-x-auto">
              {block.content.code || t('blocks.placeholders.code')}
            </pre>
          </div>
        );
      case 'image':
        {
          const size = block.content.size || 'md';
          const align = block.content.align || 'center';
          const sizeClass = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-4xl' : 'max-w-2xl';
          const alignClass =
            align === 'left'
              ? 'mr-auto'
              : align === 'right'
              ? 'ml-auto'
              : 'mx-auto';
          return block.content.url ? (
            <div className={`space-y-2 ${alignClass} ${sizeClass}`}>
              <img
                src={block.content.url}
                alt={block.content.alt || ''}
                className="w-full rounded-2xl border border-[color:var(--border)]"
              />
              {block.content.caption ? (
                <div className="text-xs text-muted text-center">{block.content.caption}</div>
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-muted">{t('blocks.placeholders.image')}</div>
          );
        }
      case 'list': {
        const ordered = !!block.content.ordered;
        const nested = !!block.content.nested;
        const items = Array.isArray(block.content.items) ? block.content.items : [];
        if (items.length === 0) {
          return <div className="text-sm text-muted">{t('blocks.placeholders.list')}</div>;
        }
        const ListTag = ordered ? 'ol' : 'ul';
        return (
          <ListTag className={`space-y-2 pl-5 text-foreground/90 ${ordered ? 'list-decimal' : 'list-disc'}`}>
            {items.map((item: string, idx: number) => {
              const [parent, childrenRaw] = nested && item.includes('::') ? item.split('::') : [item, ''];
              const children = childrenRaw
                ? childrenRaw
                    .split('|')
                    .map((child) => child.trim())
                    .filter(Boolean)
                : [];
              return (
                <li key={`list-${idx}`}>
                  <div>{parent.trim()}</div>
                  {nested && children.length > 0 && (
                    <ul className="mt-2 space-y-1 pl-4 list-disc text-muted">
                      {children.map((child, childIndex) => (
                        <li key={`list-${idx}-${childIndex}`}>{child}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ListTag>
        );
      }
      case 'checklist': {
        const items = Array.isArray(block.content.items) ? block.content.items : [];
        if (items.length === 0) {
          return <div className="text-sm text-muted">{t('blocks.placeholders.checklist')}</div>;
        }
        return (
          <div className="space-y-2">
            {items.map((item: { text?: string; checked?: boolean }, idx: number) => (
              <div key={`check-${idx}`} className="flex items-start gap-2">
                <span
                  className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded border text-xs ${
                    item.checked
                      ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                      : 'border-[color:var(--border)] text-muted'
                  }`}
                >
                  {item.checked ? '✓' : ''}
                </span>
                <div className={item.checked ? 'line-through text-muted' : 'text-foreground/90'}>
                  {item.text || t('blocks.placeholders.checklistItem')}
                </div>
              </div>
            ))}
          </div>
        );
      }
      case 'definitions': {
        const items = Array.isArray(block.content.items) ? block.content.items : [];
        if (items.length === 0) {
          return <div className="text-sm text-muted">{t('blocks.placeholders.definitions')}</div>;
        }
        return (
          <dl className="space-y-3">
            {items.map((item: { term?: string; definition?: string }, idx: number) => (
              <div key={`def-${idx}`}>
                <dt className="text-sm font-semibold text-foreground">
                  {item.term || t('blocks.placeholders.definitionTerm')}
                </dt>
                <dd className="text-sm text-muted">{item.definition || t('blocks.placeholders.definition')}</dd>
              </div>
            ))}
          </dl>
        );
      }
      case 'table':
        return (
          <TableBlock
            columns={block.content?.columns}
            rows={block.content?.rows}
            caption={block.content?.caption}
          />
        );
      case 'flashcard':
        return (
          <FlashcardBlock
            front={block.content?.front}
            back={block.content?.back}
            cards={block.content?.cards}
          />
        );
      case 'flashcard_deck':
        return <FlashcardBlock cards={block.content?.cards} />;
      case 'faq': {
        const items = Array.isArray(block.content.items) ? block.content.items : [];
        if (items.length === 0) {
          return <div className="text-sm text-muted">{t('blocks.placeholders.faq')}</div>;
        }
        return (
          <div className="space-y-2">
            {items.map((item: { question?: string; answer?: string }, idx: number) => (
              <details
                key={`faq-${idx}`}
                className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-3"
              >
                <summary className="cursor-pointer text-sm font-semibold text-foreground">
                  {item.question || t('blocks.placeholders.faqQuestion')}
                </summary>
                <div className="mt-2 text-sm text-muted">
                  {item.answer || t('blocks.placeholders.faqAnswer')}
                </div>
              </details>
            ))}
          </div>
        );
      }
      case 'summary':
        return (
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-4 text-sm text-foreground">
            {block.content.text || t('blocks.placeholders.summary')}
          </div>
        );
      case 'takeaways': {
        const items = Array.isArray(block.content.items) ? block.content.items : [];
        if (items.length === 0) {
          return <div className="text-sm text-muted">{t('blocks.placeholders.takeaways')}</div>;
        }
        return (
          <ul className="space-y-2 text-foreground/90">
            {items.map((item: string, idx: number) => (
              <li key={`takeaway-${idx}`} className="flex items-start gap-2">
                <span className="mt-0.5 text-amber-400 leading-none">★</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        );
      }
      case 'quiz':
        return (
          <QuizBlock
            question={block.content?.question}
            options={block.content?.options}
            correctIndex={block.content?.correctIndex}
            explanation={block.content?.explanation}
            answer={block.content?.answer}
            questions={block.content?.questions}
          />
        );
      case 'timeline':
        return <TimelineBlock items={block.content?.items} />;
      case 'steps': {
        const steps = Array.isArray(block.content.steps) ? block.content.steps : [];
        if (steps.length === 0) {
          return <div className="text-sm text-muted">{t('blocks.placeholders.steps')}</div>;
        }
        return (
          <ol className="space-y-3">
            {steps.map((step: { title?: string; description?: string }, idx: number) => (
              <li key={`step-${idx}`} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">
                  {t('blocks.labels.step', { index: idx + 1 })}
                </div>
                <div className="text-sm font-semibold text-foreground">
                  {step.title || t('blocks.placeholders.stepTitle')}
                </div>
                {step.description ? (
                  <div className="mt-2 text-sm text-muted">{step.description}</div>
                ) : (
                  <div className="mt-2 text-sm text-muted">{t('blocks.placeholders.stepDescription')}</div>
                )}
              </li>
            ))}
          </ol>
        );
      }
      case 'mermaid':
        return <MermaidBlock code={block.content?.code} />;
      case 'graph':
        return <GraphBlock nodes={block.content?.nodes} edges={block.content?.edges} />;
      case 'attachment':
        return renderAttachmentBlock(block);
      case 'divider':
        {
          const style = block.content?.style || 'line';
          const label = block.content?.label;
          if (style === 'space') {
            return <div className="h-6" />;
          }
          return (
            <div className="relative flex items-center justify-center">
              <div
                className={`w-full ${
                  style === 'dotted' ? 'border-t border-dotted' : 'border-t'
                } border-white/10`}
              />
              {label ? (
                <span className="absolute rounded-full border border-white/10 bg-[color:var(--surface-2)] px-3 py-1 text-xs text-muted">
                  {label}
                </span>
              ) : null}
            </div>
          );
        }
        default:
          return null;
      }
    })();

    if (!content) return null;
    return <div className={isInteractive ? '' : 'cursor-default'}>{content}</div>;
  };

  const renderEditor = (block: BlockItem) => {
    const draft = drafts[block.logical_id] || block.content;
    const setDraft = (next: Record<string, any>) => {
      setDrafts((prev) => ({ ...prev, [block.logical_id]: next }));
    };
    const moveItem = <T,>(items: T[], from: number, to: number) => {
      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    };

    switch (block.type) {
      case 'heading':
        return (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">
              {t('blocks.editor.headingLevel')}
            </div>
            <select
              value={draft.level || 1}
              onChange={(event) => setDraft({ ...draft, level: Number(event.target.value) })}
              className="input-field appearance-none rounded-xl px-3 py-1.5 text-sm shadow-inner"
            >
              <option value={1}>{t('blocks.labels.headingLevel', { level: 1 })}</option>
              <option value={2}>{t('blocks.labels.headingLevel', { level: 2 })}</option>
              <option value={3}>{t('blocks.labels.headingLevel', { level: 3 })}</option>
              <option value={4}>{t('blocks.labels.headingLevel', { level: 4 })}</option>
              <option value={5}>{t('blocks.labels.headingLevel', { level: 5 })}</option>
            </select>
            <input
              value={draft.text || ''}
              onChange={(event) => setDraft({ ...draft, text: event.target.value })}
              className="input-field w-full rounded-xl px-3 py-2"
              placeholder={t('blocks.placeholders.heading')}
            />
            <input
              value={draft.subtitle || ''}
              onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })}
              className="input-field w-full rounded-xl px-3 py-2 text-sm"
              placeholder={t('blocks.placeholders.subtitle')}
            />
          </div>
        );
      case 'paragraph':
        return (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">
                  {t('blocks.paragraph.sizeLabel')}
                </div>
                <select
                  value={draft.size || 'md'}
                  onChange={(event) => setDraft({ ...draft, size: event.target.value })}
                  className="input-field w-full appearance-none rounded-xl px-3 py-2 text-sm"
                >
                  <option value="xs">{t('blocks.paragraph.size.xs')}</option>
                  <option value="sm">{t('blocks.paragraph.size.sm')}</option>
                  <option value="md">{t('blocks.paragraph.size.md')}</option>
                  <option value="lg">{t('blocks.paragraph.size.lg')}</option>
                </select>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">
                  {t('blocks.paragraph.toneLabel')}
                </div>
                <select
                  value={draft.tone || 'normal'}
                  onChange={(event) => setDraft({ ...draft, tone: event.target.value })}
                  className="input-field w-full appearance-none rounded-xl px-3 py-2 text-sm"
                >
                  <option value="normal">{t('blocks.paragraph.tone.normal')}</option>
                  <option value="muted">{t('blocks.paragraph.tone.muted')}</option>
                  <option value="lead">{t('blocks.paragraph.tone.lead')}</option>
                </select>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">
                  {t('blocks.paragraph.alignLabel')}
                </div>
                <select
                  value={draft.align || 'left'}
                  onChange={(event) => setDraft({ ...draft, align: event.target.value })}
                  className="input-field w-full appearance-none rounded-xl px-3 py-2 text-sm"
                >
                  <option value="left">{t('blocks.paragraph.align.left')}</option>
                  <option value="center">{t('blocks.paragraph.align.center')}</option>
                </select>
              </div>
            </div>
            <textarea
              value={draft.text || ''}
              onChange={(event) => setDraft({ ...draft, text: event.target.value })}
              className="input-field w-full min-h-[80px] rounded-xl px-3 py-2"
              placeholder={t('blocks.placeholders.paragraph')}
            />
          </div>
        );
      case 'quote':
        return (
          <div className="space-y-2">
            <textarea
              value={draft.text || ''}
              onChange={(event) => setDraft({ ...draft, text: event.target.value })}
              className="input-field w-full min-h-[80px] rounded-xl px-3 py-2"
              placeholder={t('blocks.placeholders.quote')}
            />
            <input
              value={draft.author || ''}
              onChange={(event) => setDraft({ ...draft, author: event.target.value })}
              className="input-field w-full rounded-xl px-3 py-2 text-sm"
              placeholder={t('blocks.placeholders.quoteAuthor')}
            />
            <input
              value={draft.source || ''}
              onChange={(event) => setDraft({ ...draft, source: event.target.value })}
              className="input-field w-full rounded-xl px-3 py-2 text-sm"
              placeholder={t('blocks.placeholders.quoteSource')}
            />
          </div>
        );
      case 'callout':
        return (
          <div className="space-y-2">
            <select
              value={draft.variant || 'info'}
              onChange={(event) => setDraft({ ...draft, variant: event.target.value })}
              className="input-field appearance-none rounded-xl px-3 py-1.5 text-sm shadow-inner"
            >
              <option value="info">{t('blocks.callout.info')}</option>
              <option value="note">{t('blocks.callout.note')}</option>
              <option value="warning">{t('blocks.callout.warning')}</option>
              <option value="tip">{t('blocks.callout.tip')}</option>
              <option value="example">{t('blocks.callout.example')}</option>
              <option value="definition">{t('blocks.callout.definition')}</option>
              <option value="summary">{t('blocks.callout.summary')}</option>
            </select>
            <input
              value={draft.title || ''}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              className="input-field w-full rounded-xl px-3 py-2 text-sm"
              placeholder={t('blocks.placeholders.calloutTitle')}
            />
            <textarea
              value={draft.text || ''}
              onChange={(event) => setDraft({ ...draft, text: event.target.value })}
              className="input-field w-full min-h-[80px] rounded-xl px-3 py-2"
              placeholder={t('blocks.placeholders.callout')}
            />
          </div>
        );
      case 'list': {
        const items = Array.isArray(draft.items) ? draft.items : [];
        const normalizedItems = items.length > 0 ? items : [''];
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={!!draft.ordered}
                  onChange={(event) => setDraft({ ...draft, ordered: event.target.checked })}
                  className="h-3.5 w-3.5 rounded border-[color:var(--border)] text-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400/40"
                />
                {t('blocks.list.ordered')}
              </label>
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={!!draft.nested}
                  onChange={(event) => setDraft({ ...draft, nested: event.target.checked })}
                  className="h-3.5 w-3.5 rounded border-[color:var(--border)] text-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400/40"
                />
                {t('blocks.list.nested')}
              </label>
            </div>
            {draft.nested && (
              <div className="text-xs text-muted">{t('blocks.list.nestedHint')}</div>
            )}
            <div className="space-y-2">
              {normalizedItems.map((item: string, idx: number) => (
                <div key={`list-item-${idx}`} className="flex items-center gap-2">
                  <input
                    value={item}
                    onChange={(event) => {
                      const next = [...normalizedItems];
                      next[idx] = event.target.value;
                      setDraft({ ...draft, items: next });
                    }}
                    className="input-field w-full rounded-xl px-3 py-2 text-sm"
                    placeholder={t('blocks.placeholders.listItem')}
                  />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (idx === 0) return;
                        setDraft({ ...draft, items: moveItem(normalizedItems, idx, idx - 1) });
                      }}
                      className="text-xs text-muted"
                      aria-label={t('blocks.editor.moveUp')}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (idx === normalizedItems.length - 1) return;
                        setDraft({ ...draft, items: moveItem(normalizedItems, idx, idx + 1) });
                      }}
                      className="text-xs text-muted"
                      aria-label={t('blocks.editor.moveDown')}
                    >
                      ↓
                    </button>
                    {normalizedItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            items: normalizedItems.filter((_item, index) => index !== idx)
                          })
                        }
                        className="text-xs text-red-400"
                      >
                        {t('blocks.editor.remove')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setDraft({ ...draft, items: [...normalizedItems, ''] })}
              className="btn-ghost inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs"
            >
              {t('blocks.editor.addItem')}
            </button>
          </div>
        );
      }
      case 'checklist': {
        const items = Array.isArray(draft.items) ? draft.items : [];
        const normalizedItems = items.length > 0 ? items : [{ text: '', checked: false }];
        return (
          <div className="space-y-3">
            <div className="space-y-2">
              {normalizedItems.map((item: { text?: string; checked?: boolean }, idx: number) => (
                <div key={`check-item-${idx}`} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!item.checked}
                    onChange={(event) => {
                      const next = normalizedItems.map((entry) => ({ ...entry }));
                      next[idx].checked = event.target.checked;
                      setDraft({ ...draft, items: next });
                    }}
                    className="h-4 w-4 rounded border-[color:var(--border)] text-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400/40"
                  />
                  <input
                    value={item.text || ''}
                    onChange={(event) => {
                      const next = normalizedItems.map((entry) => ({ ...entry }));
                      next[idx].text = event.target.value;
                      setDraft({ ...draft, items: next });
                    }}
                    className="input-field w-full rounded-xl px-3 py-2 text-sm"
                    placeholder={t('blocks.placeholders.checklistItem')}
                  />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (idx === 0) return;
                        setDraft({ ...draft, items: moveItem(normalizedItems, idx, idx - 1) });
                      }}
                      className="text-xs text-muted"
                      aria-label={t('blocks.editor.moveUp')}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (idx === normalizedItems.length - 1) return;
                        setDraft({ ...draft, items: moveItem(normalizedItems, idx, idx + 1) });
                      }}
                      className="text-xs text-muted"
                      aria-label={t('blocks.editor.moveDown')}
                    >
                      ↓
                    </button>
                    {normalizedItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            items: normalizedItems.filter((_item, index) => index !== idx)
                          })
                        }
                        className="text-xs text-red-400"
                      >
                        {t('blocks.editor.remove')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setDraft({ ...draft, items: [...normalizedItems, { text: '', checked: false }] })
              }
              className="btn-ghost inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs"
            >
              {t('blocks.editor.addItem')}
            </button>
          </div>
        );
      }
      case 'definitions': {
        const items = Array.isArray(draft.items) ? draft.items : [];
        const normalizedItems = items.length > 0 ? items : [{ term: '', definition: '' }];
        return (
          <div className="space-y-3">
            <div className="space-y-3">
              {normalizedItems.map((item: { term?: string; definition?: string }, idx: number) => (
                <div key={`def-item-${idx}`} className="space-y-2 rounded-xl border border-[color:var(--border)] p-3">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>{t('blocks.labels.definition', { index: idx + 1 })}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (idx === 0) return;
                          setDraft({ ...draft, items: moveItem(normalizedItems, idx, idx - 1) });
                        }}
                        className="text-xs text-muted"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (idx === normalizedItems.length - 1) return;
                          setDraft({ ...draft, items: moveItem(normalizedItems, idx, idx + 1) });
                        }}
                        className="text-xs text-muted"
                      >
                        ↓
                      </button>
                      {normalizedItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              items: normalizedItems.filter((_item, index) => index !== idx)
                            })
                          }
                          className="text-xs text-red-400"
                        >
                          {t('blocks.editor.remove')}
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    value={item.term || ''}
                    onChange={(event) => {
                      const next = normalizedItems.map((entry) => ({ ...entry }));
                      next[idx].term = event.target.value;
                      setDraft({ ...draft, items: next });
                    }}
                    className="input-field w-full rounded-xl px-3 py-2 text-sm"
                    placeholder={t('blocks.placeholders.definitionTerm')}
                  />
                  <textarea
                    value={item.definition || ''}
                    onChange={(event) => {
                      const next = normalizedItems.map((entry) => ({ ...entry }));
                      next[idx].definition = event.target.value;
                      setDraft({ ...draft, items: next });
                    }}
                    className="input-field w-full min-h-[80px] rounded-xl px-3 py-2 text-sm"
                    placeholder={t('blocks.placeholders.definition')}
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setDraft({ ...draft, items: [...normalizedItems, { term: '', definition: '' }] })}
              className="btn-ghost inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs"
            >
              {t('blocks.editor.addItem')}
            </button>
          </div>
        );
      }
      case 'code':
        return (
          <div className="space-y-2">
            <input
              value={draft.language || ''}
              onChange={(event) =>
                setDrafts((prev) => ({
                  ...prev,
                  [block.logical_id]: { ...draft, language: event.target.value }
                }))
              }
              className="input-field w-full rounded-xl px-3 py-2 text-sm"
              placeholder={t('blocks.placeholders.codeLang')}
            />
            <textarea
              value={draft.code || ''}
              onChange={(event) =>
                setDrafts((prev) => ({
                  ...prev,
                  [block.logical_id]: { ...draft, code: event.target.value }
                }))
              }
              className="input-field w-full min-h-[120px] rounded-xl px-3 py-2 font-mono text-sm text-cyan-100"
            />
          </div>
        );
      case 'image':
        return (
          <div className="space-y-2">
            <input
              value={draft.url || ''}
              onChange={(event) => setDraft({ ...draft, url: event.target.value })}
              className="input-field w-full rounded-xl px-3 py-2 text-sm"
              placeholder={t('blocks.placeholders.imageUrl')}
            />
            <input
              value={draft.alt || ''}
              onChange={(event) => setDraft({ ...draft, alt: event.target.value })}
              className="input-field w-full rounded-xl px-3 py-2 text-sm"
              placeholder={t('blocks.placeholders.imageAlt')}
            />
            <input
              value={draft.caption || ''}
              onChange={(event) => setDraft({ ...draft, caption: event.target.value })}
              className="input-field w-full rounded-xl px-3 py-2 text-sm"
              placeholder={t('blocks.placeholders.imageCaption')}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">
                  {t('blocks.image.sizeLabel')}
                </div>
                <select
                  value={draft.size || 'md'}
                  onChange={(event) => setDraft({ ...draft, size: event.target.value })}
                  className="input-field w-full appearance-none rounded-xl px-3 py-2 text-sm"
                >
                  <option value="sm">{t('blocks.image.size.sm')}</option>
                  <option value="md">{t('blocks.image.size.md')}</option>
                  <option value="lg">{t('blocks.image.size.lg')}</option>
                </select>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">
                  {t('blocks.image.alignLabel')}
                </div>
                <select
                  value={draft.align || 'center'}
                  onChange={(event) => setDraft({ ...draft, align: event.target.value })}
                  className="input-field w-full appearance-none rounded-xl px-3 py-2 text-sm"
                >
                  <option value="left">{t('blocks.image.align.left')}</option>
                  <option value="center">{t('blocks.image.align.center')}</option>
                  <option value="right">{t('blocks.image.align.right')}</option>
                </select>
              </div>
            </div>
          </div>
        );
      case 'attachment':
        return renderAttachmentBlock(block);
      case 'divider':
        return (
          <div className="space-y-2">
            <input
              value={draft.label || ''}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              className="input-field w-full rounded-xl px-3 py-2 text-sm"
              placeholder={t('blocks.placeholders.dividerLabel')}
            />
            <select
              value={draft.style || 'line'}
              onChange={(event) => setDraft({ ...draft, style: event.target.value })}
              className="input-field w-full appearance-none rounded-xl px-3 py-2 text-sm"
            >
              <option value="line">{t('blocks.divider.style.line')}</option>
              <option value="space">{t('blocks.divider.style.space')}</option>
              <option value="dotted">{t('blocks.divider.style.dotted')}</option>
            </select>
          </div>
        );
      case 'table': {
        const columns = Array.isArray(draft.columns) ? draft.columns : [];
        const rows = Array.isArray(draft.rows) ? draft.rows : [];
        const columnCount = columns.length || (rows[0]?.length ?? 0);
        const normalizedColumns =
          columnCount > 0
            ? Array.from(
                { length: columnCount },
                (_val, idx) => columns[idx] ?? t('blocks.labels.column', { index: idx + 1 })
              )
            : columns;
        const normalizedRows =
          rows.length > 0
            ? rows.map((row) =>
                Array.from({ length: columnCount || row.length || 1 }, (_val, idx) => row?.[idx] ?? '')
              )
            : [Array.from({ length: columnCount || 1 }, () => '')];

        return (
          <div className="space-y-4">
            <input
              value={draft.caption || ''}
              onChange={(event) => setDraft({ ...draft, caption: event.target.value })}
              className="input-field w-full rounded-xl px-3 py-2 text-sm"
              placeholder={t('blocks.placeholders.tableCaption')}
            />
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.2em] text-muted">
                {t('blocks.editor.columns')}
              </div>
              <button
                type="button"
                onClick={() => {
                  const nextColumns = [
                    ...normalizedColumns,
                    t('blocks.labels.column', { index: normalizedColumns.length + 1 })
                  ];
                  const nextRows = normalizedRows.map((row) => [...row, '']);
                  setDraft({ ...draft, columns: nextColumns, rows: nextRows });
                }}
                className="btn-ghost rounded-full px-3 py-1 text-xs"
              >
                {t('blocks.editor.addColumn')}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {normalizedColumns.map((col, colIndex) => (
                <div key={`col-${colIndex}`} className="flex items-center gap-2">
                  <input
                    value={col}
                    onChange={(event) => {
                      const nextColumns = [...normalizedColumns];
                      nextColumns[colIndex] = event.target.value;
                      setDraft({ ...draft, columns: nextColumns, rows: normalizedRows });
                    }}
                    className="input-field w-full rounded-xl px-3 py-2 text-sm"
                  />
                  {normalizedColumns.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const nextColumns = normalizedColumns.filter((_c, idx) => idx !== colIndex);
                        const nextRows = normalizedRows.map((row) =>
                          row.filter((_cell, idx) => idx !== colIndex)
                        );
                        setDraft({ ...draft, columns: nextColumns, rows: nextRows });
                      }}
                      className="text-xs text-red-400"
                    >
                      {t('blocks.editor.remove')}
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.2em] text-muted">
                {t('blocks.editor.rows')}
              </div>
              <button
                type="button"
                onClick={() => {
                  const nextRows = [...normalizedRows, Array.from({ length: columnCount || 1 }, () => '')];
                  setDraft({ ...draft, columns: normalizedColumns, rows: nextRows });
                }}
                className="btn-ghost rounded-full px-3 py-1 text-xs"
              >
                {t('blocks.editor.addRow')}
              </button>
            </div>
            <div className="space-y-3">
              {normalizedRows.map((row, rowIndex) => (
                <div key={`row-${rowIndex}`} className="space-y-2 rounded-xl border border-[color:var(--border)] p-3">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>{t('blocks.labels.row', { index: rowIndex + 1 })}</span>
                    {normalizedRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const nextRows = normalizedRows.filter((_r, idx) => idx !== rowIndex);
                          setDraft({ ...draft, columns: normalizedColumns, rows: nextRows });
                        }}
                        className="text-red-400"
                      >
                        {t('blocks.editor.remove')}
                      </button>
                    )}
                  </div>
                  <div className="grid gap-2">
                    {row.map((cell, cellIndex) => (
                      <input
                        key={`cell-${rowIndex}-${cellIndex}`}
                        value={cell}
                        onChange={(event) => {
                          const nextRows = normalizedRows.map((r) => [...r]);
                          nextRows[rowIndex][cellIndex] = event.target.value;
                          setDraft({ ...draft, columns: normalizedColumns, rows: nextRows });
                        }}
                        placeholder={
                          normalizedColumns[cellIndex] ||
                          t('blocks.labels.column', { index: cellIndex + 1 })
                        }
                        className="input-field w-full rounded-xl px-3 py-2 text-sm"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }
      case 'timeline': {
        const items = Array.isArray(draft.items) ? draft.items : [];
        const normalizedItems =
          items.length > 0 ? items : [{ title: '', description: '', order: '' }];
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.2em] text-muted">
                {t('blocks.timeline.itemsLabel')}
              </div>
              <button
                type="button"
                onClick={() => {
                  setDraft({
                    ...draft,
                    items: [...normalizedItems, { title: '', description: '', order: '' }]
                  });
                }}
                className="btn-ghost rounded-full px-3 py-1 text-xs"
              >
                {t('blocks.editor.addItem')}
              </button>
            </div>
            <div className="space-y-3">
              {normalizedItems.map((item, idx) => (
                <div key={`timeline-${idx}`} className="space-y-2 rounded-xl border border-[color:var(--border)] p-3">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>{t('blocks.labels.item', { index: idx + 1 })}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (idx === 0) return;
                          setDraft({ ...draft, items: moveItem(normalizedItems, idx, idx - 1) });
                        }}
                        className="text-xs text-muted"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (idx === normalizedItems.length - 1) return;
                          setDraft({ ...draft, items: moveItem(normalizedItems, idx, idx + 1) });
                        }}
                        className="text-xs text-muted"
                      >
                        ↓
                      </button>
                      {normalizedItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const nextItems = normalizedItems.filter((_i, i) => i !== idx);
                            setDraft({ ...draft, items: nextItems });
                          }}
                          className="text-red-400"
                        >
                          {t('blocks.editor.remove')}
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    value={item.title || ''}
                    onChange={(event) => {
                      const nextItems = normalizedItems.map((entry) => ({ ...entry }));
                      nextItems[idx].title = event.target.value;
                      setDraft({ ...draft, items: nextItems });
                    }}
                    placeholder={t('blocks.placeholders.timelineTitle')}
                    className="input-field w-full rounded-xl px-3 py-2 text-sm"
                  />
                  <input
                    value={(item.order ?? '').toString()}
                    onChange={(event) => {
                      const nextItems = normalizedItems.map((entry) => ({ ...entry }));
                      nextItems[idx].order = event.target.value;
                      setDraft({ ...draft, items: nextItems });
                    }}
                    placeholder={t('blocks.placeholders.timelineOrder')}
                    className="input-field w-full rounded-xl px-3 py-2 text-sm"
                  />
                  <textarea
                    value={item.description || ''}
                    onChange={(event) => {
                      const nextItems = normalizedItems.map((entry) => ({ ...entry }));
                      nextItems[idx].description = event.target.value;
                      setDraft({ ...draft, items: nextItems });
                    }}
                    placeholder={t('blocks.placeholders.timelineDescription')}
                    className="input-field w-full min-h-[80px] rounded-xl px-3 py-2 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        );
      }
      case 'steps': {
        const steps = Array.isArray(draft.steps) ? draft.steps : [];
        const normalizedSteps = steps.length > 0 ? steps : [{ title: '', description: '' }];
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.2em] text-muted">
                {t('blocks.steps.stepsLabel')}
              </div>
              <button
                type="button"
                onClick={() =>
                  setDraft({ ...draft, steps: [...normalizedSteps, { title: '', description: '' }] })
                }
                className="btn-ghost rounded-full px-3 py-1 text-xs"
              >
                {t('blocks.editor.addItem')}
              </button>
            </div>
            <div className="space-y-3">
              {normalizedSteps.map((step: { title?: string; description?: string }, idx: number) => (
                <div key={`step-${idx}`} className="space-y-2 rounded-xl border border-[color:var(--border)] p-3">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>{t('blocks.labels.step', { index: idx + 1 })}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (idx === 0) return;
                          setDraft({ ...draft, steps: moveItem(normalizedSteps, idx, idx - 1) });
                        }}
                        className="text-xs text-muted"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (idx === normalizedSteps.length - 1) return;
                          setDraft({ ...draft, steps: moveItem(normalizedSteps, idx, idx + 1) });
                        }}
                        className="text-xs text-muted"
                      >
                        ↓
                      </button>
                      {normalizedSteps.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const nextSteps = normalizedSteps.filter((_s, i) => i !== idx);
                            setDraft({ ...draft, steps: nextSteps });
                          }}
                          className="text-xs text-red-400"
                        >
                          {t('blocks.editor.remove')}
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    value={step.title || ''}
                    onChange={(event) => {
                      const nextSteps = normalizedSteps.map((entry) => ({ ...entry }));
                      nextSteps[idx].title = event.target.value;
                      setDraft({ ...draft, steps: nextSteps });
                    }}
                    placeholder={t('blocks.placeholders.stepTitle')}
                    className="input-field w-full rounded-xl px-3 py-2 text-sm"
                  />
                  <textarea
                    value={step.description || ''}
                    onChange={(event) => {
                      const nextSteps = normalizedSteps.map((entry) => ({ ...entry }));
                      nextSteps[idx].description = event.target.value;
                      setDraft({ ...draft, steps: nextSteps });
                    }}
                    placeholder={t('blocks.placeholders.stepDescription')}
                    className="input-field w-full min-h-[80px] rounded-xl px-3 py-2 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        );
      }
      case 'faq': {
        const items = Array.isArray(draft.items) ? draft.items : [];
        const normalizedItems = items.length > 0 ? items : [{ question: '', answer: '' }];
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.2em] text-muted">
                {t('blocks.faq.itemsLabel')}
              </div>
              <button
                type="button"
                onClick={() =>
                  setDraft({ ...draft, items: [...normalizedItems, { question: '', answer: '' }] })
                }
                className="btn-ghost rounded-full px-3 py-1 text-xs"
              >
                {t('blocks.editor.addItem')}
              </button>
            </div>
            <div className="space-y-3">
              {normalizedItems.map((item: { question?: string; answer?: string }, idx: number) => (
                <div key={`faq-${idx}`} className="space-y-2 rounded-xl border border-[color:var(--border)] p-3">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>{t('blocks.labels.question', { index: idx + 1 })}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (idx === 0) return;
                          setDraft({ ...draft, items: moveItem(normalizedItems, idx, idx - 1) });
                        }}
                        className="text-xs text-muted"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (idx === normalizedItems.length - 1) return;
                          setDraft({ ...draft, items: moveItem(normalizedItems, idx, idx + 1) });
                        }}
                        className="text-xs text-muted"
                      >
                        ↓
                      </button>
                      {normalizedItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              items: normalizedItems.filter((_item, index) => index !== idx)
                            })
                          }
                          className="text-xs text-red-400"
                        >
                          {t('blocks.editor.remove')}
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    value={item.question || ''}
                    onChange={(event) => {
                      const nextItems = normalizedItems.map((entry) => ({ ...entry }));
                      nextItems[idx].question = event.target.value;
                      setDraft({ ...draft, items: nextItems });
                    }}
                    placeholder={t('blocks.placeholders.faqQuestion')}
                    className="input-field w-full rounded-xl px-3 py-2 text-sm"
                  />
                  <textarea
                    value={item.answer || ''}
                    onChange={(event) => {
                      const nextItems = normalizedItems.map((entry) => ({ ...entry }));
                      nextItems[idx].answer = event.target.value;
                      setDraft({ ...draft, items: nextItems });
                    }}
                    placeholder={t('blocks.placeholders.faqAnswer')}
                    className="input-field w-full min-h-[80px] rounded-xl px-3 py-2 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        );
      }
      case 'summary':
        return (
          <textarea
            value={draft.text || ''}
            onChange={(event) => setDraft({ ...draft, text: event.target.value })}
            className="input-field w-full min-h-[100px] rounded-xl px-3 py-2 text-sm"
            placeholder={t('blocks.placeholders.summary')}
          />
        );
      case 'takeaways': {
        const items = Array.isArray(draft.items) ? draft.items : [];
        const normalizedItems = items.length > 0 ? items : [''];
        return (
          <div className="space-y-3">
            <div className="space-y-2">
              {normalizedItems.map((item: string, idx: number) => (
                <div key={`takeaway-${idx}`} className="flex items-center gap-2">
                  <input
                    value={item}
                    onChange={(event) => {
                      const next = [...normalizedItems];
                      next[idx] = event.target.value;
                      setDraft({ ...draft, items: next });
                    }}
                    className="input-field w-full rounded-xl px-3 py-2 text-sm"
                    placeholder={t('blocks.placeholders.takeawaysItem')}
                  />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (idx === 0) return;
                        setDraft({ ...draft, items: moveItem(normalizedItems, idx, idx - 1) });
                      }}
                      className="text-xs text-muted"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (idx === normalizedItems.length - 1) return;
                        setDraft({ ...draft, items: moveItem(normalizedItems, idx, idx + 1) });
                      }}
                      className="text-xs text-muted"
                    >
                      ↓
                    </button>
                    {normalizedItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            items: normalizedItems.filter((_item, index) => index !== idx)
                          })
                        }
                        className="text-xs text-red-400"
                      >
                        {t('blocks.editor.remove')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setDraft({ ...draft, items: [...normalizedItems, ''] })}
              className="btn-ghost inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs"
            >
              {t('blocks.editor.addItem')}
            </button>
          </div>
        );
      }
      case 'quiz': {
        const initialQuestions = Array.isArray(draft.questions)
          ? draft.questions
          : [
              {
                question: draft.question || '',
                options: Array.isArray(draft.options) ? draft.options : [''],
                correctIndex: draft.correctIndex ?? undefined,
                explanation: draft.explanation || '',
                answer: draft.answer || ''
              }
            ];
        const normalizedQuestions =
          initialQuestions.length > 0
            ? initialQuestions
            : [{ question: '', options: [''], explanation: '' }];
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.2em] text-muted">
                {t('blocks.quiz.questionsLabel')}
              </div>
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    questions: [
                      ...normalizedQuestions,
                      { question: '', options: [''], explanation: '' }
                    ]
                  })
                }
                className="btn-ghost rounded-full px-3 py-1 text-xs"
              >
                {t('blocks.quiz.addQuestion')}
              </button>
            </div>
            <div className="space-y-3">
              {normalizedQuestions.map((q, qIndex) => (
                <div key={`question-${qIndex}`} className="space-y-2 rounded-xl border border-[color:var(--border)] p-3">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>{t('blocks.labels.question', { index: qIndex + 1 })}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (qIndex === 0) return;
                          setDraft({ ...draft, questions: moveItem(normalizedQuestions, qIndex, qIndex - 1) });
                        }}
                        className="text-xs text-muted"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (qIndex === normalizedQuestions.length - 1) return;
                          setDraft({ ...draft, questions: moveItem(normalizedQuestions, qIndex, qIndex + 1) });
                        }}
                        className="text-xs text-muted"
                      >
                        ↓
                      </button>
                      {normalizedQuestions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const nextQuestions = normalizedQuestions.filter((_q, idx) => idx !== qIndex);
                            setDraft({ ...draft, questions: nextQuestions });
                          }}
                          className="text-red-400"
                        >
                          {t('blocks.editor.remove')}
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    value={q.question || ''}
                    onChange={(event) => {
                      const nextQuestions = normalizedQuestions.map((item) => ({ ...item }));
                      nextQuestions[qIndex].question = event.target.value;
                      setDraft({ ...draft, questions: nextQuestions });
                    }}
                    placeholder={t('blocks.placeholders.quizQuestion')}
                    className="input-field w-full rounded-xl px-3 py-2 text-sm"
                  />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted">
                      <span>{t('blocks.quiz.optionsLabel')}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const nextQuestions = normalizedQuestions.map((item) => ({ ...item }));
                          const nextOptions = Array.isArray(nextQuestions[qIndex].options)
                            ? [...nextQuestions[qIndex].options, '']
                            : [''];
                          nextQuestions[qIndex].options = nextOptions;
                          setDraft({ ...draft, questions: nextQuestions });
                        }}
                        className="text-xs text-muted"
                      >
                        {t('blocks.quiz.addOption')}
                      </button>
                    </div>
                    {(Array.isArray(q.options) ? q.options : ['']).map((opt: string, optIndex: number) => (
                      <div key={`option-${qIndex}-${optIndex}`} className="flex items-center gap-2">
                        <input
                          value={opt}
                          onChange={(event) => {
                            const nextQuestions = normalizedQuestions.map((item) => ({ ...item }));
                            const nextOptions = Array.isArray(nextQuestions[qIndex].options)
                              ? [...nextQuestions[qIndex].options]
                              : [];
                            nextOptions[optIndex] = event.target.value;
                            nextQuestions[qIndex].options = nextOptions;
                            setDraft({ ...draft, questions: nextQuestions });
                          }}
                          className="input-field w-full rounded-xl px-3 py-2 text-sm"
                          placeholder={t('blocks.labels.option', { index: optIndex + 1 })}
                        />
                        {Array.isArray(q.options) && q.options.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const nextQuestions = normalizedQuestions.map((item) => ({ ...item }));
                              const nextOptions = (nextQuestions[qIndex].options || []).filter(
                                (_o: string, idx: number) => idx !== optIndex
                              );
                              nextQuestions[qIndex].options = nextOptions;
                              if (typeof nextQuestions[qIndex].correctIndex === 'number') {
                                if (nextQuestions[qIndex].correctIndex === optIndex) {
                                  nextQuestions[qIndex].correctIndex = undefined;
                                } else if (nextQuestions[qIndex].correctIndex > optIndex) {
                                  nextQuestions[qIndex].correctIndex -= 1;
                                }
                              }
                              setDraft({ ...draft, questions: nextQuestions });
                            }}
                            className="text-xs text-red-400"
                          >
                            {t('blocks.editor.remove')}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <select
                    value={typeof q.correctIndex === 'number' ? q.correctIndex : ''}
                    onChange={(event) => {
                      const nextQuestions = normalizedQuestions.map((item) => ({ ...item }));
                      const value = event.target.value;
                      nextQuestions[qIndex].correctIndex = value === '' ? undefined : Number(value);
                      setDraft({ ...draft, questions: nextQuestions });
                    }}
                    className="input-field w-full appearance-none rounded-xl px-3 py-2 text-sm"
                  >
                    <option value="">{t('blocks.quiz.correctOptionPlaceholder')}</option>
                    {(Array.isArray(q.options) ? q.options : []).map((_opt: string, optIndex: number) => (
                      <option key={`correct-${qIndex}-${optIndex}`} value={optIndex}>
                        {t('blocks.labels.option', { index: optIndex + 1 })}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={q.explanation || ''}
                    onChange={(event) => {
                      const nextQuestions = normalizedQuestions.map((item) => ({ ...item }));
                      nextQuestions[qIndex].explanation = event.target.value;
                      setDraft({ ...draft, questions: nextQuestions });
                    }}
                    placeholder={t('blocks.placeholders.quizExplanation')}
                    className="input-field w-full min-h-[80px] rounded-xl px-3 py-2 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        );
      }
      case 'flashcard': {
        return (
          <div className="space-y-3">
            <input
              value={draft.front || ''}
              onChange={(event) => setDraft({ ...draft, front: event.target.value })}
              placeholder={t('blocks.placeholders.flashcardFront')}
              className="input-field w-full rounded-xl px-3 py-2 text-sm"
            />
            <textarea
              value={draft.back || ''}
              onChange={(event) => setDraft({ ...draft, back: event.target.value })}
              placeholder={t('blocks.placeholders.flashcardBack')}
              className="input-field w-full min-h-[80px] rounded-xl px-3 py-2 text-sm"
            />
          </div>
        );
      }
      case 'flashcard_deck': {
        const cards = Array.isArray(draft.cards) ? draft.cards : [];
        const normalizedCards = cards.length > 0 ? cards : [{ front: '', back: '' }];
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.2em] text-muted">
                {t('blocks.flashcardDeck.cardsLabel')}
              </div>
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    cards: [...normalizedCards, { front: '', back: '' }]
                  })
                }
                className="btn-ghost rounded-full px-3 py-1 text-xs"
              >
                {t('blocks.flashcardDeck.addCard')}
              </button>
            </div>
            <div className="space-y-3">
              {normalizedCards.map((card: { front?: string; back?: string }, idx: number) => (
                <div key={`card-${idx}`} className="space-y-2 rounded-xl border border-[color:var(--border)] p-3">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>{t('blocks.labels.card', { index: idx + 1 })}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (idx === 0) return;
                          setDraft({ ...draft, cards: moveItem(normalizedCards, idx, idx - 1) });
                        }}
                        className="text-xs text-muted"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (idx === normalizedCards.length - 1) return;
                          setDraft({ ...draft, cards: moveItem(normalizedCards, idx, idx + 1) });
                        }}
                        className="text-xs text-muted"
                      >
                        ↓
                      </button>
                      {normalizedCards.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const nextCards = normalizedCards.filter((_c, i) => i !== idx);
                            setDraft({ ...draft, cards: nextCards });
                          }}
                          className="text-xs text-red-400"
                        >
                          {t('blocks.editor.remove')}
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    value={card.front || ''}
                    onChange={(event) => {
                      const nextCards = normalizedCards.map((item) => ({ ...item }));
                      nextCards[idx].front = event.target.value;
                      setDraft({ ...draft, cards: nextCards });
                    }}
                    placeholder={t('blocks.placeholders.flashcardFront')}
                    className="input-field w-full rounded-xl px-3 py-2 text-sm"
                  />
                  <textarea
                    value={card.back || ''}
                    onChange={(event) => {
                      const nextCards = normalizedCards.map((item) => ({ ...item }));
                      nextCards[idx].back = event.target.value;
                      setDraft({ ...draft, cards: nextCards });
                    }}
                    placeholder={t('blocks.placeholders.flashcardBack')}
                    className="input-field w-full min-h-[80px] rounded-xl px-3 py-2 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        );
      }
      case 'mermaid':
        return (
          <textarea
            value={draft.code || ''}
            onChange={(event) => setDraft({ ...draft, code: event.target.value })}
            className="input-field w-full min-h-[160px] rounded-xl px-3 py-2 font-mono text-sm"
            placeholder={t('blocks.placeholders.mermaid')}
          />
        );
      case 'graph': {
        const nodes = Array.isArray(draft.nodes) ? draft.nodes : [];
        const edges = Array.isArray(draft.edges) ? draft.edges : [];
        const normalizedNodes = nodes.length > 0 ? nodes : [{ id: '', label: '' }];
        const normalizedEdges = edges.length > 0 ? edges : [{ from: '', to: '', label: '' }];
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.2em] text-muted">
                {t('blocks.graph.nodesLabel')}
              </div>
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    nodes: [...normalizedNodes, { id: '', label: '' }],
                    edges: normalizedEdges
                  })
                }
                className="btn-ghost rounded-full px-3 py-1 text-xs"
              >
                {t('blocks.graph.addNode')}
              </button>
            </div>
            <div className="space-y-2">
              {normalizedNodes.map((node, idx) => (
                <div key={`node-${idx}`} className="grid gap-2 sm:grid-cols-2 items-center">
                  <input
                    value={node.id || ''}
                    onChange={(event) => {
                      const nextNodes = normalizedNodes.map((item) => ({ ...item }));
                      nextNodes[idx].id = event.target.value;
                      setDraft({ ...draft, nodes: nextNodes, edges: normalizedEdges });
                    }}
                    placeholder={t('blocks.graph.nodeId')}
                    className="input-field w-full rounded-xl px-3 py-2 text-sm"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      value={node.label || ''}
                      onChange={(event) => {
                        const nextNodes = normalizedNodes.map((item) => ({ ...item }));
                        nextNodes[idx].label = event.target.value;
                        setDraft({ ...draft, nodes: nextNodes, edges: normalizedEdges });
                      }}
                      placeholder={t('blocks.graph.nodeLabel')}
                      className="input-field w-full rounded-xl px-3 py-2 text-sm"
                    />
                    {normalizedNodes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const nextNodes = normalizedNodes.filter((_n, i) => i !== idx);
                          setDraft({ ...draft, nodes: nextNodes, edges: normalizedEdges });
                        }}
                        className="text-xs text-red-400"
                      >
                        {t('blocks.editor.remove')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.2em] text-muted">
                {t('blocks.graph.edgesLabel')}
              </div>
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    nodes: normalizedNodes,
                    edges: [...normalizedEdges, { from: '', to: '', label: '' }]
                  })
                }
                className="btn-ghost rounded-full px-3 py-1 text-xs"
              >
                {t('blocks.graph.addEdge')}
              </button>
            </div>
            <div className="space-y-2">
              {normalizedEdges.map((edge, idx) => (
                <div key={`edge-${idx}`} className="grid gap-2 sm:grid-cols-3 items-center">
                  <input
                    value={edge.from || ''}
                    onChange={(event) => {
                      const nextEdges = normalizedEdges.map((item) => ({ ...item }));
                      nextEdges[idx].from = event.target.value;
                      setDraft({ ...draft, nodes: normalizedNodes, edges: nextEdges });
                    }}
                    placeholder={t('blocks.graph.edgeFrom')}
                    className="input-field w-full rounded-xl px-3 py-2 text-sm"
                  />
                  <input
                    value={edge.to || ''}
                    onChange={(event) => {
                      const nextEdges = normalizedEdges.map((item) => ({ ...item }));
                      nextEdges[idx].to = event.target.value;
                      setDraft({ ...draft, nodes: normalizedNodes, edges: nextEdges });
                    }}
                    placeholder={t('blocks.graph.edgeTo')}
                    className="input-field w-full rounded-xl px-3 py-2 text-sm"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      value={edge.label || ''}
                      onChange={(event) => {
                        const nextEdges = normalizedEdges.map((item) => ({ ...item }));
                        nextEdges[idx].label = event.target.value;
                        setDraft({ ...draft, nodes: normalizedNodes, edges: nextEdges });
                      }}
                      placeholder={t('blocks.graph.edgeLabel')}
                      className="input-field w-full rounded-xl px-3 py-2 text-sm"
                    />
                    {normalizedEdges.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const nextEdges = normalizedEdges.filter((_e, i) => i !== idx);
                          setDraft({ ...draft, nodes: normalizedNodes, edges: nextEdges });
                        }}
                        className="text-xs text-red-400"
                      >
                        {t('blocks.editor.remove')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }
      default:
        return null;
    }
  };

  const aiLanguageOptions = [
    { code: 'en', label: '🇺🇸', name: t('ai.languages.english') },
    { code: 'de', label: '🇩🇪', name: t('ai.languages.german') },
    { code: 'uk', label: '🇺🇦', name: t('ai.languages.ukrainian') },
    { code: 'fr', label: '🇫🇷', name: t('ai.languages.french') },
    { code: 'es', label: '🇪🇸', name: t('ai.languages.spanish') },
    { code: 'it', label: '🇮🇹', name: t('ai.languages.italian') },
    { code: 'pt', label: '🇵🇹', name: t('ai.languages.portuguese') },
    { code: 'nl', label: '🇳🇱', name: t('ai.languages.dutch') },
    { code: 'pl', label: '🇵🇱', name: t('ai.languages.polish') },
    { code: 'tr', label: '🇹🇷', name: t('ai.languages.turkish') },
    { code: 'ja', label: '🇯🇵', name: t('ai.languages.japanese') },
    { code: 'ko', label: '🇰🇷', name: t('ai.languages.korean') }
  ] as const;

  const aiContentTypeOptions = aiContentTypeIds.map((id) => ({
    id,
    label: t(`ai.types.${id}`)
  }));


  const toggleAiContentType = (id: AiContentType) => {
    setAiContentTypes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAiFabClick = () => {
    if (!canUseAi) return;
    setAiOpen((prev) => !prev);
  };

  const addSource = (source: AiSource) => {
    setAiSources((prev) => {
      if (prev.some((item) => item.id === source.id)) {
        return prev;
      }
      return [...prev, source];
    });
  };

  const removeSource = (id: string) => {
    setAiSources((prev) => prev.filter((item) => item.id !== id));
  };

  const handleAddManualSource = () => {
    const text = aiSourceInput.trim();
    if (!text) {
      setAiManualError(t('ai.sources.emptyText'));
      return;
    }
    addSource({
      id: `text-${Date.now()}`,
      type: 'text',
      label: t('ai.sources.textLabel'),
      content: text
    });
    setAiSourceInput('');
    setAiManualError(null);
  };

  const handleTempFileUpload = async (file: File) => {
    const authToken = await getAuthToken();
    if (!authToken) return;
    setAiUploadingSource(true);
    setAiTempFileError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/generate/parse', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: formData
      });
      if (await handleUnauthorized(response)) return;
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t('ai.sources.uploadFailed'));
      }
      const data = await response.json();
      if (!data.parsed_text || data.parsed_text.trim().length === 0) {
        throw new Error(t('ai.sources.emptyParsed'));
      }
      addSource({
        id: `temp-${Date.now()}`,
        type: 'file',
        label: data.filename || t('ai.sources.fileLabel'),
        content: data.parsed_text
      });
    } catch (err) {
      setAiTempFileError(err instanceof Error ? err.message : t('ai.sources.uploadFailed'));
    } finally {
      setAiUploadingSource(false);
    }
  };

  const handleTempFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await handleTempFileUpload(file);
    event.target.value = '';
  };

  const handleGenerateAi = async () => {
    if (!page || !canUseAi) return;
    if (aiSources.length === 0) {
      setAiToast(t('ai.sources.empty'));
      return;
    }
    setAiGenerating(true);
    setAiToast(null);
    try {
      const authToken = await getAuthToken();
      if (!authToken) {
        throw new Error(t('ai.generateFailed'));
      }
      const selectedTypes = aiContentTypeIds.filter((id) => aiContentTypes[id]);
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          page_id: page.id,
          language_code: aiLanguage,
          selected_content_types: selectedTypes,
          use_page_context: aiUsePageContext,
          sources: aiSources.map((source) => ({
            type: source.type,
            content: source.content
          }))
        })
      });

      if (await handleUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(t('ai.generateFailed'));
      }

      await loadBlocks(page.id);
      setAiOpen(false);
      window.dispatchEvent(new Event('dashboard:refresh'));
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('ai.generateFailed');
      setAiToast(message);
    } finally {
      setAiGenerating(false);
    }
  };

  const canPortal = typeof document !== 'undefined';

  if (isLoading) {
    return (
      <div className="relative p-6 space-y-8 text-foreground pb-[calc(env(safe-area-inset-bottom)+6rem)] lg:pb-6">
        <motion.div
          className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-6"
          animate={{ opacity: [0.55, 0.9, 0.55] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        >
          <div className="h-4 w-40 rounded-full bg-white/10" />
          <div className="mt-6 h-10 w-2/3 rounded-full bg-white/10" />
          <div className="mt-4 h-4 w-1/2 rounded-full bg-white/10" />
          <div className="mt-8 h-20 w-full rounded-2xl bg-white/5" />
          <div className="mt-4 h-20 w-full rounded-2xl bg-white/5" />
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-red-500">{error}</div>
    );
  }

  if (!page) {
    return (
      <div className="p-6 text-sm text-slate-600 dark:text-slate-300">
        {t('pages.notFound')}
      </div>
    );
  }

  return (
    <div className="relative p-6 space-y-8 text-foreground pb-[calc(env(safe-area-inset-bottom)+6rem)] lg:pb-6">
      <div
        className={`space-y-4 transition-transform duration-300 lg:translate-y-0 lg:opacity-100 ${
          isMobile && isHeaderHidden ? '-translate-y-6 opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
        }`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {breadcrumbs.length > 0 && (
            <nav className="flex flex-wrap items-center gap-2 text-sm text-muted">
              {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;
                const displayTitle =
                  crumb.title === 'Без назви' || !crumb.title
                    ? t('pages.untitledDisplay')
                    : crumb.title;
                return (
                  <div key={crumb.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!isLast) {
                          router.push(`/${locale}/pages/${crumb.slug}`);
                        }
                      }}
                      className={`transition ${
                        isLast
                          ? 'text-foreground font-medium'
                          : 'text-muted hover:text-foreground'
                      }`}
                      aria-current={isLast ? 'page' : undefined}
                    >
                      {displayTitle}
                    </button>
                    {!isLast && <span className="text-slate-400">/</span>}
                  </div>
                );
              })}
            </nav>
          )}

          {isOwner && (
            <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
              <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--surface-2)] px-2 py-1 shadow-inner backdrop-blur-xl">
                <button
                  onClick={() => setEditMode((prev) => !prev)}
                  className="rounded-full px-3 py-2 text-xs font-medium text-foreground hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-400/40"
                >
                  {editMode ? t('editor.editMode') : t('editor.readMode')}
                </button>
                <Dialog.Root open={isActionsOpen} onOpenChange={setIsActionsOpen}>
                  <Dialog.Trigger asChild>
                    <button
                      type="button"
                      className="rounded-full px-3 py-2 text-xs font-medium text-foreground hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-400/40 lg:hidden"
                      aria-label="More actions"
                    >
                      ⋯
                    </button>
                  </Dialog.Trigger>
                  <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 z-[70] !m-0 bg-black/40 backdrop-blur-sm" />
                    <Dialog.Content className="fixed inset-x-4 bottom-4 z-[80] rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-4 shadow-[0_20px_60px_rgba(15,23,42,0.35)]">
                      <VisuallyHidden>
                        <Dialog.Title>Actions</Dialog.Title>
                      </VisuallyHidden>
                      <div className="text-xs uppercase tracking-[0.2em] text-muted">
                        Actions
                      </div>
                      <div className="mt-4 space-y-2">
                        <button
                          type="button"
                          onClick={() => {
                            handleCreateChild();
                            setIsActionsOpen(false);
                          }}
                          className="btn-ghost w-full rounded-xl px-4 py-3 text-left text-sm text-foreground"
                        >
                          {t('pages.newChild')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleExportPdf();
                            setIsActionsOpen(false);
                          }}
                          disabled={!page || isExporting || blocks.length === 0}
                          className="btn-ghost w-full rounded-xl px-4 py-3 text-left text-sm text-foreground disabled:opacity-60"
                        >
                          {isExporting ? 'Exporting...' : 'Export as PDF'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleDelete();
                            setIsActionsOpen(false);
                          }}
                          className="w-full rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-left text-sm text-red-600"
                        >
                          {t('pages.delete')}
                        </button>
                      </div>
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>
                <button
                  onClick={handleExportPdf}
                  disabled={!page || isExporting || blocks.length === 0}
                  className="hidden lg:inline-flex rounded-full px-3 py-2 text-xs font-medium text-foreground hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-400/40 disabled:opacity-60"
                >
                  {isExporting ? 'Exporting...' : 'Export as PDF'}
                </button>
                {editMode && (
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.docx,.md,.txt,.png,.jpg,.jpeg,.webp"
                    onChange={handleFileSelection}
                  />
                )}
                <button
                  onClick={handleCreateChild}
                  className="hidden lg:inline-flex rounded-full px-3 py-2 text-xs font-medium text-foreground hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-400/40"
                >
                  {t('pages.newChild')}
                </button>
                <button
                  onClick={handleDelete}
                  className="hidden lg:inline-flex rounded-full px-3 py-2 text-xs font-medium text-red-600 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 focus-visible:ring-2 focus-visible:ring-red-400/40"
                >
                  {t('pages.delete')}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <input
            value={title}
            onChange={(event) => {
              if (!isOwner) return;
              setTitle(event.target.value);
            }}
            onBlur={() => {
              if (!isOwner) return;
              handleRename();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
            }}
            readOnly={!isOwner}
            placeholder="Enter Signal Title..."
            className="w-full max-w-[90%] text-[clamp(1.875rem,3vw,3rem)] font-bold bg-transparent text-foreground outline-none border-b border-transparent placeholder:text-muted focus:border-cyan-400/50 focus:drop-shadow-[0_0_12px_rgba(34,211,238,0.6)] text-balance break-words mb-8"
          />
          {isOwner && (
            <button
              type="button"
              onClick={handleToggleFavorite}
              className="mb-8 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--surface-2)] text-amber-300 transition hover:bg-[color:var(--surface-3)]"
              aria-label={page?.is_favorite ? t('pages.removeFromFavorites') : t('pages.addToFavorites')}
            >
              <Star
                className="h-4 w-4"
                strokeWidth={1.5}
                fill={page?.is_favorite ? 'currentColor' : 'none'}
              />
            </button>
          )}
        </div>
      </div>

      {isSaving && (
        <div className="text-xs text-muted">{t('pages.saving')}</div>
      )}
      {editMode && (isUploading || uploadError) && (
        <div className="space-y-1">
          {isUploading && (
            <div className="text-xs text-muted">
              {t('blocks.attachments.uploading')} {uploadProgress}%
            </div>
          )}
          {uploadError && (
            <div className="flex items-center gap-2 text-xs text-red-500">
              <span>{uploadError}</span>
              <button
                type="button"
                onClick={handleRetryUpload}
                className="text-xs text-red-500 underline underline-offset-2"
              >
                {t('blocks.attachments.retry')}
              </button>
            </div>
          )}
        </div>
      )}
      {attachmentsError && (
        <div className="text-xs text-muted">
          {attachmentsError}
        </div>
      )}
      {editMode && !attachmentsError && attachments.length === 0 && (
        <div className="text-xs text-muted">
          {t('blocks.attachments.empty')}
        </div>
      )}

      {isBlocksLoading ? (
        <div className="rounded-2xl border border-dashed border-[color:var(--border)] p-8 flex items-center justify-center min-h-[120px]">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-foreground" />
        </div>
      ) : (
        <>
          {blocks.length === 0 && !editMode && (
            <div className="rounded-2xl border border-dashed border-[color:var(--border)] p-8 text-muted">
              {t('blocks.empty')}
            </div>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={blocks.map((b) => b.logical_id)} strategy={verticalListSortingStrategy}>
          <LayoutGroup>
            <div className="space-y-5">
              {editMode && blocks.length === 0 && (
                <div className="rounded-2xl border border-dashed border-[color:var(--border)] p-6">
                  {renderAddBlockControl(0)}
                </div>
              )}
              {blocks.map((block, index) => {
                const isFocused = activeBlockId === block.logical_id || editingId === block.logical_id;
                const canReorder = editMode && (!isMobile || mobileReorderMode);
                const canSwipe = isMobile && editMode && !mobileReorderMode;
                const isSwipeOpen = !!swipeOpen[block.logical_id];
                return (
                  <motion.div
                    layout
                    key={block.logical_id}
                    className="space-y-2"
                  >
                    {editMode && renderAddBlockControl(index)}

                    <div
                      onMouseEnter={() => {
                        if (!editMode) return;
                        setActiveBlockId(block.logical_id);
                      }}
                      onMouseLeave={() => {
                        if (!editMode) return;
                        setActiveBlockId((current) =>
                          current === block.logical_id && editingId !== block.logical_id ? null : current
                        );
                      }}
                      onClick={() => {
                        if (!editMode) return;
                        setActiveBlockId(block.logical_id);
                      }}
                      onPointerDown={() => {
                        if (!editMode || !isMobile) return;
                        setActiveBlockId(block.logical_id);
                      }}
                      className={`group relative overflow-visible rounded-2xl border border-transparent p-4 transition transition-[margin] duration-200 ${
                        editMode && isMobile && isFocused ? 'mt-12' : ''
                      }`}
                    >
                      <motion.div
                        aria-hidden
                        className="pointer-events-none absolute -inset-6 rounded-3xl bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.12),rgba(15,23,42,0))]"
                        animate={{ opacity: isFocused ? 1 : 0 }}
                        transition={{ duration: 0.2 }}
                      />
                      <div
                        className={`absolute inset-0 rounded-2xl border transition ${
                          isFocused
                            ? 'border-blue-500/30 bg-[color:var(--surface-2)] backdrop-blur'
                            : 'border-transparent'
                        }`}
                      />

                      <SortableRow block={block} enabled={canReorder}>
                        {({ dragHandleProps }) => (
                          <div className="relative space-y-3">
                            {savingBlockId === block.logical_id && (
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 z-20 rounded-2xl border border-white/10 bg-black/40 backdrop-blur-sm flex items-center justify-center"
                              >
                                <motion.div
                                  className="h-8 w-8 rounded-full border border-cyan-400/40 bg-cyan-400/10"
                                  animate={{ scale: [0.9, 1.1, 0.9], opacity: [0.6, 1, 0.6] }}
                                  transition={{ duration: 1, repeat: Infinity }}
                                />
                              </motion.div>
                            )}
                            {editMode && (
                              <div
                                className={`absolute -top-10 right-0 z-[60] flex translate-y-2 items-center gap-1 rounded-full border border-[color:var(--border)] bg-[color:var(--surface-2)] px-2 py-1 text-foreground shadow-[0_0_18px_rgba(15,23,42,0.25)] backdrop-blur-md opacity-0 transition pointer-events-none lg:group-hover:opacity-100 lg:group-hover:translate-y-0 lg:group-hover:pointer-events-auto ${
                                  isMobile && isFocused ? 'opacity-100 translate-y-0 pointer-events-auto' : ''
                                }`}
                              >
                                {editingId === block.logical_id ? (
                                  <>
                                    <button
                                      className="rounded-full p-1 text-slate-200 hover:bg-white/10 hover:text-white"
                                      onClick={() => handleSaveBlock(block)}
                                      type="button"
                                      aria-label={t('blocks.save')}
                                      title={t('blocks.save')}
                                    >
                                      <Check className="h-3.5 w-3.5" strokeWidth={1} />
                                    </button>
                                    <button
                                      className="rounded-full p-1 text-slate-300 hover:bg-white/10 hover:text-white"
                                      onClick={() => handleCancelEdit(block)}
                                      type="button"
                                      aria-label={t('blocks.cancel')}
                                      title={t('blocks.cancel')}
                                    >
                                      <X className="h-3.5 w-3.5" strokeWidth={1} />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    {dragHandleProps && (
                                      <button
                                        ref={dragHandleProps.setActivatorNodeRef}
                                        className="rounded-full p-1 text-slate-300 hover:bg-white/10 hover:text-white cursor-grab"
                                        {...dragHandleProps.listeners}
                                        type="button"
                                        aria-label="Move block"
                                        title="Move block"
                                      >
                                        <GripVertical className="h-3.5 w-3.5" strokeWidth={1} />
                                      </button>
                                    )}
                                    <button
                                      className="rounded-full p-1 text-slate-300 hover:bg-white/10 hover:text-white"
                                      onClick={() => handleEditBlock(block)}
                                      type="button"
                                      aria-label={t('blocks.edit')}
                                      title={t('blocks.edit')}
                                    >
                                      <Edit2 className="h-3.5 w-3.5" strokeWidth={1} />
                                    </button>
                                    <span className="mx-1 h-4 w-px bg-white/10" />
                                    {(block.type !== 'attachment' || isOwner) && (
                                      <button
                                        className="rounded-full p-1 text-slate-300 hover:bg-white/10 hover:text-rose-200"
                                        onClick={() => handleDeleteBlock(block)}
                                        onPointerDown={() => handleDeleteHoldStart(block)}
                                        onPointerUp={handleDeleteHoldCancel}
                                        onPointerLeave={handleDeleteHoldCancel}
                                        type="button"
                                        aria-label={t('blocks.delete')}
                                        title={t('blocks.delete')}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1} />
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            )}

                            <div className="relative">
                              <motion.div
                                className="relative z-10"
                                drag={canSwipe ? 'x' : false}
                                dragConstraints={{ left: -120, right: 0 }}
                                dragElastic={0.2}
                                onDragEnd={(_, info) => {
                                  if (!canSwipe) return;
                                  if (info.offset.x < -60) {
                                    setSwipeOpen((prev) => ({ ...prev, [block.logical_id]: true }));
                                  } else {
                                    setSwipeOpen((prev) => ({ ...prev, [block.logical_id]: false }));
                                  }
                                }}
                                animate={{ x: canSwipe && isSwipeOpen ? -120 : 0 }}
                                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                                onPointerDown={() => {
                                  if (!isMobile || !editMode) return;
                                  if (longPressTimerRef.current) {
                                    window.clearTimeout(longPressTimerRef.current);
                                  }
                                  longPressTimerRef.current = window.setTimeout(() => {
                                    if (navigator.vibrate) navigator.vibrate(10);
                                    setReorderTargetId(block.logical_id);
                                    setReorderSheetOpen(true);
                                  }, 600);
                                }}
                                onPointerUp={() => {
                                  if (longPressTimerRef.current) {
                                    window.clearTimeout(longPressTimerRef.current);
                                    longPressTimerRef.current = null;
                                  }
                                }}
                                onPointerLeave={() => {
                                  if (longPressTimerRef.current) {
                                    window.clearTimeout(longPressTimerRef.current);
                                    longPressTimerRef.current = null;
                                  }
                                }}
                                onPointerCancel={() => {
                                  if (longPressTimerRef.current) {
                                    window.clearTimeout(longPressTimerRef.current);
                                    longPressTimerRef.current = null;
                                  }
                                }}
                              >
                                {editMode && editingId === block.logical_id
                                  ? renderEditor(block)
                                  : renderBlockContent(block)}
                              </motion.div>
                            </div>
                          </div>
                        )}
                      </SortableRow>
                    </div>
                  </motion.div>
                );
              })}

              {editMode && blocks.length > 0 && renderAddBlockControl(blocks.length)}
            </div>
          </LayoutGroup>
        </SortableContext>
      </DndContext>
        </>
      )}

      {isExporting && (
        <div className="fixed inset-0 z-[60] !m-0 h-screen w-screen flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="glass-surface-strong rounded-lg px-4 py-3 text-sm text-foreground shadow-lg">
            Exporting PDF...
          </div>
        </div>
      )}

      {aiGenerating && (
        <div className="fixed inset-0 z-[70] !m-0 h-screen w-screen flex items-center justify-center bg-slate-900/50 backdrop-blur-md">
          <motion.div
            className="rounded-full border border-cyan-400/40 bg-cyan-400/10 h-14 w-14"
            animate={{ scale: [0.9, 1.15, 0.9], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        </div>
      )}

      {aiToast && (
        <div className="fixed bottom-20 right-5 sm:right-6 z-40 rounded-lg bg-slate-900 text-white px-4 py-3 text-sm shadow-lg">
          {aiToast}
        </div>
      )}

      {exportToast && (
        <div className="fixed bottom-20 right-5 sm:right-6 z-40 rounded-lg bg-slate-900 text-white px-4 py-3 text-sm shadow-lg">
          {exportToast}
        </div>
      )}

      <Dialog.Root open={reorderSheetOpen} onOpenChange={setReorderSheetOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[70] !m-0 bg-black/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-4 bottom-4 z-[80] rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-4 shadow-[0_20px_60px_rgba(15,23,42,0.35)] lg:hidden">
            <VisuallyHidden>
              <Dialog.Title>Block actions</Dialog.Title>
            </VisuallyHidden>
            <div className="text-xs uppercase tracking-[0.2em] text-muted">
              Block actions
            </div>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setMobileReorderMode((prev) => !prev);
                  setReorderSheetOpen(false);
                }}
                className="btn-ghost w-full rounded-xl px-4 py-3 text-left text-sm text-foreground"
              >
                {mobileReorderMode ? 'Disable Reorder Mode' : 'Enable Reorder Mode'}
              </button>
              {reorderTargetId && (
                <div className="text-xs text-muted">
                  Long-press on a block to toggle reorder mode.
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <AnimatePresence>
        {aiOpen && canUseAi && (
          <motion.div
            ref={aiBlockRef}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="glass-surface-strong rounded-2xl p-4 sm:p-6"
          >
            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-blue-400" strokeWidth={1.5} />
                    {t('ai.title')}
                  </div>
                  <button
                    type="button"
                    onClick={() => setAiOpen(false)}
                    className="btn-ghost rounded-full border border-[color:var(--border)] p-1 text-muted hover:text-foreground"
                    aria-label={t('ai.fabAria')}
                  >
                    <X className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="glass-surface rounded-2xl p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted">
                        {t('ai.typesLabel')}
                      </div>
                      <label className="flex items-center gap-2 text-xs text-blue-500">
                        <Sparkles className="h-3.5 w-3.5 text-blue-400" strokeWidth={1.5} />
                        <input
                          type="checkbox"
                          checked={aiUsePageContext}
                          onChange={(event) => setAiUsePageContext(event.target.checked)}
                          className="h-3.5 w-3.5 rounded border-blue-300/40 text-blue-500 focus-visible:ring-2 focus-visible:ring-blue-400/40"
                        />
                        {t('ai.usePageContext')}
                      </label>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {aiContentTypeOptions.map((option) => {
                        const active = aiContentTypes[option.id];
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => toggleAiContentType(option.id)}
                            className={`rounded-full px-3 py-1 text-xs transition ${
                              active
                                ? 'ai-type-active border border-blue-400/50 bg-blue-500/10 text-blue-200 shadow-[0_0_12px_rgba(59,130,246,0.4)]'
                                : 'border border-[color:var(--border)] bg-[color:var(--surface-2)] text-muted hover:border-blue-400/30'
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="glass-surface rounded-2xl p-4 space-y-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-muted">
                      {t('ai.languageLabel')}
                    </div>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setAiLangMenuOpen((prev) => !prev);
                        }}
                        ref={aiLangButtonRef}
                        className="flex w-full items-center justify-between rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-4 py-2 text-sm text-foreground shadow-inner shadow-black/10 hover:border-blue-400/40"
                      >
                        <span className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-blue-400" strokeWidth={1.5} />
                          {
                            aiLanguageOptions.find((option) => option.code === aiLanguage)?.label
                          }{' '}
                          {aiLanguageOptions.find((option) => option.code === aiLanguage)?.name}
                        </span>
                        <span className="text-muted">⌘</span>
                      </button>
                      {aiLangMenuOpen && aiLangMenuPos && canPortal
                        ? createPortal(
                            <AnimatePresence>
                              <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 8 }}
                                style={{
                                  top: aiLangMenuPos.top,
                                  left: aiLangMenuPos.left,
                                  width: aiLangMenuPos.width
                                }}
                                className="fixed z-[90] max-h-72 overflow-y-auto rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-strong)] p-2 shadow-xl backdrop-blur-2xl"
                                onClick={(event) => event.stopPropagation()}
                              >
                                {aiLanguageOptions.map((option) => (
                                  <button
                                    key={option.code}
                                    type="button"
                                    onClick={() => {
                                      setAiLanguage(option.code);
                                      setAiLangMenuOpen(false);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-white/10"
                                  >
                                    <span>{option.label}</span>
                                    <span>{option.name}</span>
                                  </button>
                                ))}
                              </motion.div>
                            </AnimatePresence>,
                            document.body
                          )
                        : null}
                    </div>
                  </div>
                </div>

                <div className="glass-surface rounded-2xl p-4 space-y-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">
                    {t('ai.sources.manualLabel')}
                  </div>
                  <textarea
                    value={aiSourceInput}
                    onChange={(event) => setAiSourceInput(event.target.value)}
                    placeholder={t('ai.sources.manualPlaceholder')}
                    className="input-field w-full min-h-[120px] rounded-xl px-4 py-3 text-sm"
                  />
                  {aiManualError && (
                    <div className="text-xs text-red-400">{aiManualError}</div>
                  )}
                  <button
                    type="button"
                    onClick={handleAddManualSource}
                    className="btn-ghost inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] px-3 py-1.5 text-xs text-foreground hover:border-blue-400/40"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {t('ai.sources.addText')}
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setAiDragActive(true);
                  }}
                  onDragLeave={() => setAiDragActive(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setAiDragActive(false);
                    const file = event.dataTransfer.files?.[0];
                    if (file) {
                      handleTempFileUpload(file);
                    }
                  }}
                  className={`rounded-2xl border-2 border-dashed px-4 py-6 text-center transition ${
                    aiDragActive
                      ? 'border-blue-400/70 bg-blue-500/10 text-blue-600'
                      : 'border-[color:var(--border)] bg-[color:var(--surface-2)] text-muted'
                  }`}
                >
                  <UploadCloud className="mx-auto h-6 w-6 text-blue-400" strokeWidth={1.5} />
                  <div className="mt-2 text-sm">{t('ai.sources.attachFile')}</div>
                  <div className="text-xs text-muted">{t('ai.sources.attachHint')}</div>
                  <button
                    type="button"
                    onClick={() => aiTempFileInputRef.current?.click()}
                    disabled={aiUploadingSource}
                    className="btn-ghost mt-3 inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] px-3 py-1.5 text-xs text-foreground hover:border-blue-400/40"
                  >
                    <FileText className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {aiUploadingSource ? t('ai.sources.uploading') : t('ai.sources.attachButton')}
                  </button>
                  {aiTempFileError && (
                    <div className="mt-2 text-xs text-red-400">{aiTempFileError}</div>
                  )}
                  <input
                    ref={aiTempFileInputRef}
                    type="file"
                    accept=".pdf,.docx,.md,.txt"
                    className="hidden"
                    onChange={handleTempFileSelection}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 space-y-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">
                    {t('ai.sources.title')}
                  </div>
                  {aiSources.length === 0 && (
                    <div className="text-xs text-muted">{t('ai.sources.empty')}</div>
                  )}
                  <div className="space-y-2">
                    <AnimatePresence>
                      {aiSources.map((source) => (
                        <motion.div
                          layout
                          key={source.id}
                          initial={{ opacity: 0, x: 16 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 16 }}
                          className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-xs text-foreground"
                        >
                          <div className="flex items-center gap-2">
                            <span>{getSourceIcon(source)}</span>
                            <span>{getSourceDisplayLabel(source, t)}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeSource(source.id)}
                            className="text-muted hover:text-foreground"
                          >
                            {t('ai.sources.remove')}
                          </button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-muted">{t('ai.helper')}</div>
                  <motion.button
                    type="button"
                    disabled={aiGenerating || aiUploadingSource || aiSources.length === 0}
                    onClick={handleGenerateAi}
                    whileTap={{ scale: 0.98 }}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-[0_0_24px_rgba(139,92,246,0.45)] ${
                      aiGenerating || aiUploadingSource || aiSources.length === 0
                        ? 'bg-slate-700/60 cursor-not-allowed shadow-none'
                        : 'bg-gradient-to-r from-purple-500 via-fuchsia-500 to-blue-500 animate-pulse'
                    }`}
                  >
                    <Wand2 className="h-4 w-4" strokeWidth={1.5} />
                    {aiGenerating ? t('ai.generating') : t('ai.generate')}
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {canUseAi && (
        <button
          type="button"
          aria-label={t('ai.fabAria')}
          onClick={handleAiFabClick}
          className={`fixed right-5 z-40 rounded-full text-white shadow-lg focus-visible:ring-2 focus-visible:ring-primary/40 transition-all ${
            isMobile
              ? `bottom-[calc(env(safe-area-inset-bottom)+4rem)] ${
                  isHeaderHidden
                    ? 'h-3 w-3 p-0 bg-cyan-400 animate-pulse'
                    : 'px-4 py-3 text-sm font-semibold bg-primary hover:bg-primary-dark'
                }`
              : 'bottom-5 sm:bottom-6 px-4 py-3 text-sm font-semibold bg-primary hover:bg-primary-dark'
          }`}
        >
          {isMobile && isHeaderHidden ? <span className="sr-only">AI</span> : 'AI'}
        </button>
      )}
    </div>
  );
}
