-- Responsive photograph renditions.
--
-- `sources` maps rendered width -> storage path, e.g. {"640": "uploads/x-640.webp"}.
-- Rows uploaded before this existed keep an empty object and fall back to the
-- original file, so nothing breaks.
ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS sources jsonb NOT NULL DEFAULT '{}'::jsonb;

-- The bucket is made public so images serve from Storage's public endpoint.
-- `anon` already held SELECT on storage.objects for this bucket, so the previous
-- signing proxy added a round trip per image request without adding any privacy.
UPDATE storage.buckets SET public = true WHERE id = 'photos';
