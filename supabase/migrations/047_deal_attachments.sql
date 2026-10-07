-- ============================================================
-- 047_deal_attachments — anexos do negócio com link rastreável
--
--   deal-attachments  bucket PRIVADO (diferente de chat-media/flow-media):
--                     proposta tem preço, não pode ficar numa URL pública
--                     eterna. O cliente chega ao arquivo só por /p/<token>,
--                     que gera uma URL assinada de curta duração.
--   deal_attachments  um arquivo por linha + o token do link de compartilhar
--   deal_attachment_opens  cada abertura do link (vira evento em Atividades)
--
-- O link vale até ser desativado (share_enabled) ou trocado (novo token).
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Bucket privado
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'deal-attachments',
  'deal-attachments',
  false,
  20971520, -- 20 MB
  ARRAY[
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Caminho: account-<account_id>/<arquivo> (mesma regra de chat-media / flow-media).
-- Sem política de leitura pública: o cliente lê por URL assinada gerada no servidor.
DROP POLICY IF EXISTS "Members can read deal attachments" ON storage.objects;
CREATE POLICY "Members can read deal attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'deal-attachments'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Members can upload deal attachments" ON storage.objects;
CREATE POLICY "Members can upload deal attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'deal-attachments'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Members can delete deal attachments" ON storage.objects;
CREATE POLICY "Members can delete deal attachments"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'deal-attachments'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

-- ------------------------------------------------------------
-- 2. Anexos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deal_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL CHECK (btrim(file_name) <> ''),
  mime_type TEXT,
  size_bytes BIGINT,
  -- 128 bits aleatórios; é o que vai no link /p/<token>
  share_token TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  share_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  open_count INTEGER NOT NULL DEFAULT 0,
  last_opened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deal_attachments_deal ON deal_attachments (deal_id, created_at DESC);
ALTER TABLE deal_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deal_attachments_select ON deal_attachments;
DROP POLICY IF EXISTS deal_attachments_insert ON deal_attachments;
DROP POLICY IF EXISTS deal_attachments_update ON deal_attachments;
DROP POLICY IF EXISTS deal_attachments_delete ON deal_attachments;
CREATE POLICY deal_attachments_select ON deal_attachments FOR SELECT USING (is_account_member(account_id));
CREATE POLICY deal_attachments_insert ON deal_attachments FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY deal_attachments_update ON deal_attachments FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY deal_attachments_delete ON deal_attachments FOR DELETE USING (is_account_member(account_id, 'agent'));

-- ------------------------------------------------------------
-- 3. Aberturas do link (gravadas só pelo servidor, com service role)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deal_attachment_opens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  attachment_id UUID NOT NULL REFERENCES deal_attachments(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deal_attachment_opens_deal ON deal_attachment_opens (deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deal_attachment_opens_attachment ON deal_attachment_opens (attachment_id, created_at DESC);
ALTER TABLE deal_attachment_opens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deal_attachment_opens_select ON deal_attachment_opens;
CREATE POLICY deal_attachment_opens_select ON deal_attachment_opens FOR SELECT USING (is_account_member(account_id));
