-- ============================================================
-- 034_storage_restrict_listing.sql
--
-- Closes anonymous listing of the public Storage buckets.
--
-- Migrations 008 / 016 / 023 created SELECT policies on
-- storage.objects with no role or owner check:
--
--   USING (bucket_id = 'avatars' | 'flow-media' | 'chat-media')
--
-- The buckets are public so Meta (and <img> tags) can fetch files by
-- URL — that path (/storage/v1/object/public/...) does NOT go through
-- RLS. The SELECT policy only governs the authenticated Storage API,
-- where it let anyone holding the public anon key call `list()` on
-- every account's folder and enumerate (then download) all chat
-- attachments, flow media and avatars across tenants, without login.
--
-- The app never lists or downloads through the API: it uploads, then
-- reads via the public URL. SELECT is still needed for avatar upsert
-- and for `remove()`, so it is scoped to the same owner rule as the
-- write policies. Public URLs keep working unchanged.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- avatars: path is <user_id>/<file>
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own avatar" ON storage.objects;
CREATE POLICY "Users can read their own avatar"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ------------------------------------------------------------
-- flow-media: path is account-<account_id>/<file>
-- (legacy <user_id>/<file> still accepted, matching migration 020)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Flow media is publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Members can read flow media" ON storage.objects;
CREATE POLICY "Members can read flow media"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'flow-media'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid()
          AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
      )
      OR auth.uid()::text = (storage.foldername(name))[1]
    )
  );

-- ------------------------------------------------------------
-- chat-media: path is account-<account_id>/<file>
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Chat media is publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Members can read chat media" ON storage.objects;
CREATE POLICY "Members can read chat media"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'chat-media'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );
