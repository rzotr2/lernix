-- supabase/scripts/setup/08-create-attachments-storage-policies.sql
-- Storage policies for private attachments bucket scoped by user prefix.

-- Allow authenticated users to read their own attachment objects
CREATE POLICY "Users can read own attachments objects" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'attachments'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- Allow authenticated users to upload to their own prefix
CREATE POLICY "Users can upload own attachments objects" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'attachments'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- Allow authenticated users to delete their own attachment objects
CREATE POLICY "Users can delete own attachments objects" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'attachments'
    AND split_part(name, '/', 1) = auth.uid()::text
  );
