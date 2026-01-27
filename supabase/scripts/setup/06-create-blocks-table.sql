-- supabase/scripts/setup/06-create-blocks-table.sql
-- Create blocks table with immutable versioning and RLS policies.

CREATE TABLE IF NOT EXISTS public.blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  logical_id uuid NOT NULL,
  type text NOT NULL,
  content jsonb NOT NULL,
  position float8 NOT NULL,
  version int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_deleted boolean NOT NULL DEFAULT false
);

-- Indexes for version resolution and ordering
CREATE INDEX IF NOT EXISTS blocks_page_logical_version_idx
  ON public.blocks(page_id, logical_id, version DESC);

CREATE INDEX IF NOT EXISTS blocks_page_position_idx
  ON public.blocks(page_id, position ASC);

-- Enable RLS
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

-- RLS policies (owner via pages.owner_id)
CREATE POLICY "Users can read their own blocks" ON public.blocks
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.pages p
      WHERE p.id = blocks.page_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own blocks" ON public.blocks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.pages p
      WHERE p.id = blocks.page_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own blocks" ON public.blocks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.pages p
      WHERE p.id = blocks.page_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own blocks" ON public.blocks
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.pages p
      WHERE p.id = blocks.page_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access to blocks" ON public.blocks
  FOR ALL TO service_role USING (true);

-- Optional verification
SELECT
  'blocks table created' as status,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'blocks'
ORDER BY ordinal_position;
