'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/AuthContext';
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
};

type BlockType =
  | 'heading'
  | 'paragraph'
  | 'callout'
  | 'code'
  | 'image'
  | 'attachment'
  | 'divider'
  | 'table'
  | 'timeline'
  | 'quiz'
  | 'flashcard'
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
};

const blockTypes: { value: BlockType; labelKey: string; icon: string }[] = [
  { value: 'heading', labelKey: 'blocks.types.heading', icon: 'H' },
  { value: 'paragraph', labelKey: 'blocks.types.paragraph', icon: '¶' },
  { value: 'callout', labelKey: 'blocks.types.callout', icon: '💬' },
  { value: 'code', labelKey: 'blocks.types.code', icon: '</>' },
  { value: 'image', labelKey: 'blocks.types.image', icon: '🖼️' },
  { value: 'divider', labelKey: 'blocks.types.divider', icon: '—' }
];

const aiContentTypeIds = ['notes', 'flashcards', 'quiz', 'tables', 'timeline', 'diagrams'] as const;
type AiContentType = (typeof aiContentTypeIds)[number];

function getDefaultContent(type: BlockType) {
  switch (type) {
    case 'heading':
      return { level: 1, text: '' };
    case 'paragraph':
      return { text: '' };
    case 'callout':
      return { variant: 'info', text: '' };
    case 'code':
      return { language: 'plaintext', code: '' };
    case 'image':
      return { url: '', alt: '' };
    case 'attachment':
      return { attachment_id: null, display_name: '', file_type: '', file_size: 0 };
    case 'divider':
      return {};
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

function SortableRow({
  block,
  children,
  enabled
}: {
  block: BlockItem;
  children: React.ReactNode;
  enabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: block.logical_id, disabled: !enabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div className="flex gap-2">
        {enabled && (
          <button
            className="mt-2 text-slate-400 hover:text-slate-600 cursor-grab"
            {...listeners}
            type="button"
          >
            ⋮⋮
          </button>
        )}
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}

export default function PageView() {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const slug = params?.slug as string;
  const locale = pathname.split('/')[1] || 'en';
  const { session, user } = useAuth();

  const [page, setPage] = useState<PageItem | null>(null);
  const [title, setTitle] = useState('');
  const [blocks, setBlocks] = useState<BlockItem[]>([]);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [originalTitle, setOriginalTitle] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, any>>>({});
  const [addIndex, setAddIndex] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
  const [downloadErrorId, setDownloadErrorId] = useState<string | null>(null);
  const [pendingInsertIndex, setPendingInsertIndex] = useState<number | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLanguage, setAiLanguage] = useState<'en' | 'de' | 'uk'>('en');
  const [aiContentTypes, setAiContentTypes] = useState<Record<AiContentType, boolean>>({
    notes: true,
    flashcards: true,
    quiz: true,
    tables: true,
    timeline: true,
    diagrams: true
  });
  const [aiNotes, setAiNotes] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiToast, setAiToast] = useState<string | null>(null);

  const historyRef = useRef<BlockItem[][]>([]);
  const redoRef = useRef<BlockItem[][]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastFileRef = useRef<File | null>(null);
  const lastInsertIndexRef = useRef<number | null>(null);
  const aiBlockRef = useRef<HTMLDivElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor)
  );

  const token = session?.access_token;
  const isOwner = !!user && !!page?.owner_id && page.owner_id === user.id;
  const canUpload = editMode && isOwner && !isUploading;
  const attachmentsMap = useMemo(
    () => new Map(attachments.map((item) => [item.id, item])),
    [attachments]
  );

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

  const loadPage = async () => {
    try {
      setIsLoading(true);
      setError(null);
      if (!token) {
        throw new Error('Unauthorized');
      }
      const response = await fetch('/api/pages', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        throw new Error(t('pages.errors.load'));
      }
      const data = await response.json();
      const found = (data.pages || []).find((p: PageItem) => p.slug === slug) || null;
      setPage(found);
      const nextTitle = found?.title || '';
      setOriginalTitle(nextTitle);
      if (nextTitle === 'Без назви') {
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
      if (!response.ok) {
        throw new Error(t('blocks.errors.load'));
      }
      const data = await response.json();
      setBlocks(data.blocks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('blocks.errors.load'));
    }
  };

  const loadAttachments = async (pageId: string) => {
    if (!token) return;
    try {
      setAttachmentsError(null);
      const response = await fetch(`/api/attachments?pageId=${pageId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
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
    if (!token) return;
    loadPage();
  }, [slug, token]);

  useEffect(() => {
    if (!page) return;
    loadBlocks(page.id);
    loadAttachments(page.id);
  }, [page?.id, token]);

  useEffect(() => {
    setAiOpen(false);
    setAiLanguage('en');
    setAiContentTypes({
      notes: true,
      flashcards: true,
      quiz: true,
      tables: true,
      timeline: true,
      diagrams: true
    });
    setAiNotes('');
  }, [page?.id]);

  useEffect(() => {
    if (!aiOpen) return;
    aiBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [aiOpen]);

  useEffect(() => {
    if (!editMode) {
      setEditingId(null);
      setDrafts({});
      setAddIndex(null);
    }
  }, [editMode]);

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

  const handleRename = async () => {
    if (!page || !title.trim()) return;
    const trimmed = title.trim();
    if (originalTitle === 'Без назви' && trimmed === t('pages.untitledDisplay')) {
      return;
    }
    if (trimmed === originalTitle) return;

    try {
      setIsSaving(true);
      if (!token) {
        throw new Error(t('pages.errors.rename'));
      }
      const response = await fetch(`/api/pages/${page.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: title.trim() })
      });
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
    if (!page) return;
    const confirmed = window.confirm(t('pages.deleteConfirm'));
    if (!confirmed) return;

    try {
      if (!token) {
        throw new Error(t('pages.errors.delete'));
      }
      const response = await fetch(`/api/pages/${page.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
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
    if (!page) return;
    try {
      if (!token) {
        throw new Error(t('pages.errors.create'));
      }
      const response = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: t('pages.newPageTitle'),
          parent_page_id: page.id
        })
      });
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

  const handleAddBlock = async (index: number, type: BlockType) => {
    if (!page || !token) return;
    const position = getInsertPosition(blocks, index);
    const content = getDefaultContent(type);
    pushHistory([...blocks]);
    try {
      const response = await fetch('/api/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          page_id: page.id,
          type,
          content,
          position
        })
      });
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
    const isOpen = addIndex === index;
    return (
      <div
        className="relative flex justify-center py-2"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setAddIndex(null);
          }
        }}
      >
        <button
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/50 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 shadow-subtle hover:shadow-hover transition"
          onClick={() => setAddIndex(isOpen ? null : index)}
          type="button"
        >
          <span className="text-sm">＋</span>
          {t('blocks.add')}
        </button>

        {isOpen && (
          <div className="absolute top-full z-20 mt-2 w-60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 shadow-lg">
            <div className="p-2">
              <button
                type="button"
                onClick={() => {
                  if (!canUpload) return;
                  setAddIndex(null);
                  handleUploadClick(index);
                }}
                disabled={!canUpload}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  canUpload
                    ? 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    : 'text-slate-400 dark:text-slate-500 cursor-not-allowed'
                }`}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold">
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
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold">
                    {type.icon}
                  </span>
                  <span>{t(type.labelKey)}</span>
                </button>
              ))}
            </div>
          </div>
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
    if (!token) return;
    const draft = drafts[block.logical_id] || block.content;
    pushHistory([...blocks]);
    try {
      const response = await fetch(`/api/blocks/${block.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: draft })
      });
      if (!response.ok) {
        throw new Error(t('blocks.errors.save'));
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
    }
  };

  const handleDeleteBlock = async (block: BlockItem) => {
    if (!token) return;
    if (block.type === 'attachment' && !isOwner) return;
    const confirmed = window.confirm(t('blocks.deleteConfirm'));
    if (!confirmed) return;

    if (block.type === 'attachment' && block.content?.attachment_id) {
      try {
        const response = await fetch(`/api/attachments/${block.content.attachment_id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
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
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        throw new Error(t('blocks.errors.delete'));
      }
      setBlocks((prev) => prev.filter((item) => item.logical_id !== block.logical_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('blocks.errors.delete'));
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
    if (!token || !page) return null;
    const response = await fetch(`/api/attachments?pageId=${page.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
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
    if (!token || !page) return;
    const position = getInsertPosition(blocks, insertIndex);
    pushHistory([...blocks]);
    const response = await fetch('/api/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

    if (!response.ok) {
      await fetch(`/api/attachments/${attachment.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      throw new Error(t('blocks.errors.create'));
    }

    const data = await response.json();
    const newBlock = data.block as BlockItem;
    setBlocks((prev) => [...prev, newBlock].sort((a, b) => a.position - b.position));
    setAddIndex(null);
  };

  const uploadAttachment = async (file: File, insertIndex: number) => {
    if (!token || !page) return;
    setUploadError(null);
    setUploadProgress(0);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('page_id', page.id);

      const response = await new Promise<{ attachment: AttachmentItem }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/attachments');
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        };
        xhr.onerror = () => reject(new Error(t('blocks.attachments.uploadFailed')));
        xhr.onload = () => {
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
      <div className="rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/40 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xl">{getAttachmentIcon(fileType)}</span>
            <div className="space-y-0.5">
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                {displayName}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {fileType || t('blocks.attachments.unknownType')}
                {fileSize ? ` • ${formatFileSize(fileSize)}` : ''}
                {!hasAccess && attachmentId ? ` • ${t('blocks.attachments.noAccess')}` : ''}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => attachmentId && handleDownloadAttachment(attachmentId)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 shadow-subtle hover:shadow-hover transition disabled:opacity-50"
            disabled={!attachmentId || !hasAccess}
          >
            {t('blocks.attachments.download')}
          </button>
        </div>
        {showDownloadError && (
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
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
    const reordered = arrayMove(blocks, oldIndex, newIndex);
    const updated = reordered.map((block, index) => ({
      ...block,
      position: getInsertPosition(reordered, index)
    }));
    pushHistory([...blocks]);
    setBlocks(updated);

    if (!token || !page) return;
    const updates = updated.map((block) => ({
      logical_id: block.logical_id,
      position: block.position
    }));
    try {
      const response = await fetch('/api/blocks/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ page_id: page.id, updates })
      });
      if (!response.ok) {
        throw new Error(t('blocks.errors.reorder'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('blocks.errors.reorder'));
    }
  };

  const renderBlockContent = (block: BlockItem) => {
    switch (block.type) {
      case 'heading':
        return (
          <div className={`font-semibold text-slate-900 dark:text-white text-${block.content.level === 1 ? '2xl' : block.content.level === 2 ? 'xl' : 'lg'}`}>
            {block.content.text || t('blocks.placeholders.heading')}
          </div>
        );
      case 'paragraph':
        return (
          <p className="text-slate-700 dark:text-slate-300">
            {block.content.text || t('blocks.placeholders.paragraph')}
          </p>
        );
      case 'callout':
        return (
          <div className="rounded-md border border-slate-200 dark:border-slate-700 p-3 text-sm">
            {block.content.text || t('blocks.placeholders.callout')}
          </div>
        );
      case 'code':
        return (
          <pre className="mt-2 bg-slate-900 text-slate-100 rounded-md p-4 text-sm overflow-x-auto">
            {block.content.code || t('blocks.placeholders.code')}
          </pre>
        );
      case 'image':
        return block.content.url ? (
          <img src={block.content.url} alt={block.content.alt || ''} className="max-w-full rounded-md border border-slate-200 dark:border-slate-700" />
        ) : (
          <div className="text-sm text-slate-500">{t('blocks.placeholders.image')}</div>
        );
      case 'table':
      case 'timeline':
      case 'quiz':
      case 'flashcard':
      case 'mermaid':
      case 'graph':
        return (
          <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 p-3 text-sm text-slate-600 dark:text-slate-300">
            {t(`ai.stub.${block.type}`)}
          </div>
        );
      case 'attachment':
        return renderAttachmentBlock(block);
      case 'divider':
        return <hr className="border-slate-200 dark:border-slate-700" />;
      default:
        return null;
    }
  };

  const renderEditor = (block: BlockItem) => {
    const draft = drafts[block.logical_id] || block.content;

    switch (block.type) {
      case 'heading':
        return (
          <div className="space-y-2">
            <select
              value={draft.level || 1}
              onChange={(event) =>
                setDrafts((prev) => ({
                  ...prev,
                  [block.logical_id]: { ...draft, level: Number(event.target.value) }
                }))
              }
              className="appearance-none bg-white dark:bg-slate-900/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-1.5 text-sm shadow-subtle hover:shadow-hover transition focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <option value={1}>H1</option>
              <option value={2}>H2</option>
              <option value={3}>H3</option>
            </select>
            <input
              value={draft.text || ''}
              onChange={(event) =>
                setDrafts((prev) => ({
                  ...prev,
                  [block.logical_id]: { ...draft, text: event.target.value }
                }))
              }
              className="w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2"
            />
          </div>
        );
      case 'paragraph':
        return (
          <textarea
            value={draft.text || ''}
            onChange={(event) =>
              setDrafts((prev) => ({
                ...prev,
                [block.logical_id]: { ...draft, text: event.target.value }
              }))
            }
            className="w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 min-h-[80px]"
          />
        );
      case 'callout':
        return (
          <div className="space-y-2">
            <select
              value={draft.variant || 'info'}
              onChange={(event) =>
                setDrafts((prev) => ({
                  ...prev,
                  [block.logical_id]: { ...draft, variant: event.target.value }
                }))
              }
              className="appearance-none bg-white dark:bg-slate-900/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-1.5 text-sm shadow-subtle hover:shadow-hover transition focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <option value="info">{t('blocks.callout.info')}</option>
              <option value="note">{t('blocks.callout.note')}</option>
              <option value="warning">{t('blocks.callout.warning')}</option>
            </select>
            <textarea
              value={draft.text || ''}
              onChange={(event) =>
                setDrafts((prev) => ({
                  ...prev,
                  [block.logical_id]: { ...draft, text: event.target.value }
                }))
              }
              className="w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 min-h-[80px]"
            />
          </div>
        );
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
              className="w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 text-sm"
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
              className="w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 min-h-[120px] font-mono text-sm overflow-x-auto whitespace-pre"
            />
          </div>
        );
      case 'image':
        return (
          <div className="space-y-2">
            <input
              value={draft.url || ''}
              onChange={(event) =>
                setDrafts((prev) => ({
                  ...prev,
                  [block.logical_id]: { ...draft, url: event.target.value }
                }))
              }
              className="w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 text-sm"
              placeholder={t('blocks.placeholders.imageUrl')}
            />
            <input
              value={draft.alt || ''}
              onChange={(event) =>
                setDrafts((prev) => ({
                  ...prev,
                  [block.logical_id]: { ...draft, alt: event.target.value }
                }))
              }
              className="w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 text-sm"
              placeholder={t('blocks.placeholders.imageAlt')}
            />
          </div>
        );
      case 'attachment':
        return renderAttachmentBlock(block);
      case 'divider':
        return <hr className="border-slate-200 dark:border-slate-700" />;
      default:
        return null;
    }
  };

  const aiLanguageOptions = [
    { code: 'en', label: '🇺🇸', name: t('ai.languages.english') },
    { code: 'de', label: '🇩🇪', name: t('ai.languages.german') },
    { code: 'uk', label: '🇺🇦', name: t('ai.languages.ukrainian') }
  ] as const;

  const aiContentTypeOptions = aiContentTypeIds.map((id) => ({
    id,
    label: t(`ai.types.${id}`)
  }));

  const toggleAiContentType = (id: AiContentType) => {
    setAiContentTypes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAiFabClick = () => {
    if (aiOpen) {
      aiBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setAiOpen(true);
  };

  const handleGenerateAi = async () => {
    if (!token || !page) return;
    setAiGenerating(true);
    setAiToast(null);
    try {
      const selectedTypes = aiContentTypeIds.filter((id) => aiContentTypes[id]);
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          page_id: page.id,
          language: aiLanguage,
          selected_content_types: selectedTypes,
          user_preferences: aiNotes.trim() || undefined
        })
      });

      if (!response.ok) {
        throw new Error(t('ai.generateFailed'));
      }

      await loadBlocks(page.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('ai.generateFailed');
      setAiToast(message);
    } finally {
      setAiGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-slate-500">{t('pages.loading')}</div>
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
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={handleRename}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
          }}
          className="text-2xl font-semibold bg-transparent text-slate-900 dark:text-white outline-none border-b border-transparent focus:border-primary/60 w-full"
        />

        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditMode((prev) => !prev)}
            className="px-3 py-2 text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-md"
          >
            {editMode ? t('editor.readMode') : t('editor.editMode')}
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
            className="px-3 py-2 text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-md"
          >
            {t('pages.newChild')}
          </button>
          <button
            onClick={handleDelete}
            className="px-3 py-2 text-sm font-medium bg-red-500 text-white rounded-md"
          >
            {t('pages.delete')}
          </button>
        </div>
      </div>

      {isSaving && (
        <div className="text-xs text-slate-500">{t('pages.saving')}</div>
      )}
      {editMode && (isUploading || uploadError) && (
        <div className="space-y-1">
          {isUploading && (
            <div className="text-xs text-slate-500">
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
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {attachmentsError}
        </div>
      )}
      {editMode && !attachmentsError && attachments.length === 0 && (
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {t('blocks.attachments.empty')}
        </div>
      )}

      {blocks.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-6 text-slate-500 dark:text-slate-400">
          {t('blocks.empty')}
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={blocks.map((b) => b.logical_id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {blocks.map((block, index) => (
              <div key={block.logical_id} className="space-y-2">
                {editMode && renderAddBlockControl(index)}

                <div
                  className={editMode ? 'rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white/70 dark:bg-slate-900/40 p-4' : ''}
                >
                  <SortableRow block={block} enabled={editMode}>
                    <div className="space-y-3">
                      {editMode && editingId === block.logical_id ? (
                        renderEditor(block)
                      ) : (
                        renderBlockContent(block)
                      )}

                      {editMode && (
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          {editingId === block.logical_id ? (
                            <>
                              <button
                                className="px-2 py-1 rounded-md bg-primary text-white"
                                onClick={() => handleSaveBlock(block)}
                                type="button"
                              >
                                {t('blocks.save')}
                              </button>
                              <button
                                className="px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800"
                                onClick={() => handleCancelEdit(block)}
                                type="button"
                              >
                                {t('blocks.cancel')}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800"
                                onClick={() => handleEditBlock(block)}
                                type="button"
                              >
                                {t('blocks.edit')}
                              </button>
                            {(block.type !== 'attachment' || isOwner) && (
                              <button
                                className="px-2 py-1 rounded-md bg-red-500 text-white"
                                onClick={() => handleDeleteBlock(block)}
                                type="button"
                              >
                                {t('blocks.delete')}
                              </button>
                            )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </SortableRow>
                </div>
              </div>
            ))}

            {editMode && renderAddBlockControl(blocks.length)}
          </div>
        </SortableContext>
      </DndContext>

      {aiToast && (
        <div className="fixed bottom-20 right-5 sm:right-6 z-40 rounded-lg bg-slate-900 text-white px-4 py-3 text-sm shadow-lg">
          {aiToast}
        </div>
      )}

      {aiOpen && (
        <div
          ref={aiBlockRef}
          className="rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-900/60 p-4 sm:p-6 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {t('ai.title')}
            </div>
            <div className="relative">
              <select
                value={aiLanguage}
                onChange={(event) => setAiLanguage(event.target.value as 'en' | 'de' | 'uk')}
                aria-label={t('ai.languageLabel')}
                className="appearance-none bg-white dark:bg-slate-900/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-full px-3 pr-8 py-1.5 text-sm shadow-subtle hover:shadow-hover transition focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {aiLanguageOptions.map((option) => (
                  <option key={option.code} value={option.code} aria-label={option.name}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">
                ▾
              </span>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {aiContentTypeOptions.map((option) => (
              <label key={option.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={aiContentTypes[option.id]}
                  onChange={() => toggleAiContentType(option.id)}
                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-primary focus-visible:ring-2 focus-visible:ring-primary/40"
                />
                {option.label}
              </label>
            ))}
          </div>

          <div className="space-y-2">
            <label className="text-sm text-slate-600 dark:text-slate-300">
              {t('ai.preferencesLabel')}
            </label>
            <textarea
              value={aiNotes}
              onChange={(event) => setAiNotes(event.target.value)}
              placeholder={t('ai.preferencesPlaceholder')}
              className="w-full min-h-[96px] bg-white/80 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </div>

          <div className="space-y-2">
            <button
              type="button"
              disabled={aiGenerating}
              aria-disabled={aiGenerating ? 'true' : 'false'}
              onClick={handleGenerateAi}
              className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition ${
                aiGenerating
                  ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                  : 'bg-primary text-white hover:bg-primary-dark'
              }`}
            >
              {aiGenerating ? t('ai.generating') : t('ai.generate')}
            </button>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {t('ai.helper')}
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        aria-label={t('ai.fabAria')}
        onClick={handleAiFabClick}
        className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-40 rounded-full bg-primary text-white px-4 py-3 text-sm font-semibold shadow-lg hover:bg-primary-dark focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        AI
      </button>
    </div>
  );
}
