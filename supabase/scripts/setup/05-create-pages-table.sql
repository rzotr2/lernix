-- supabase/scripts/setup/05-create-pages-table.sql
-- Create pages table with hierarchy and RLS policies.

CREATE TABLE IF NOT EXISTS public.pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL,
  parent_page_id uuid NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_favorite boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Unique slug per owner
CREATE UNIQUE INDEX IF NOT EXISTS pages_owner_slug_unique ON public.pages(owner_id, slug);

-- Indexes for hierarchy and sorting
CREATE INDEX IF NOT EXISTS pages_owner_id_idx ON public.pages(owner_id);
CREATE INDEX IF NOT EXISTS pages_parent_id_idx ON public.pages(parent_page_id);
CREATE INDEX IF NOT EXISTS pages_created_at_idx ON public.pages(created_at);
CREATE INDEX IF NOT EXISTS pages_owner_favorite_idx ON public.pages(owner_id, is_favorite);

-- Enable RLS
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can read their own pages" ON public.pages
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert their own pages" ON public.pages
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own pages" ON public.pages
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own pages" ON public.pages
  FOR DELETE USING (auth.uid() = owner_id);

CREATE POLICY "Service role full access to pages" ON public.pages
  FOR ALL TO service_role USING (true);

-- Optional verification
SELECT
  'pages table created' as status,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'pages'
ORDER BY ordinal_position;
