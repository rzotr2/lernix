-- supabase/scripts/setup/07-create-attachments-table.sql
-- Create attachments table for page-scoped files with RLS policies.

CREATE TABLE IF NOT EXISTS public.attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  filename text NOT NULL,
  file_type text NOT NULL,
  file_size integer NOT NULL,
  storage_path text NOT NULL,
  parsed_text text NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Indexes for page lookups and ordering
CREATE INDEX IF NOT EXISTS attachments_page_id_idx ON public.attachments(page_id);
CREATE INDEX IF NOT EXISTS attachments_created_at_idx ON public.attachments(created_at);

-- Enable RLS
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

-- RLS policies (owner via pages.owner_id)
CREATE POLICY "Users can read their own attachments" ON public.attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.pages p
      WHERE p.id = attachments.page_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own attachments" ON public.attachments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.pages p
      WHERE p.id = attachments.page_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own attachments" ON public.attachments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.pages p
      WHERE p.id = attachments.page_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own attachments" ON public.attachments
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.pages p
      WHERE p.id = attachments.page_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access to attachments" ON public.attachments
  FOR ALL TO service_role USING (true);

-- Optional verification
SELECT
  'attachments table created' as status,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'attachments'
ORDER BY ordinal_position;
