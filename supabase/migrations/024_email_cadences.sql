-- ============================================================
-- 024_email_cadences — cadências de e-mail, caixas de envio, leads quentes
--
-- Idempotent. Adapta a spec "cadências + fluxo de e-mail" ao wacrm:
--   organization_id → account_id   ·   crm_leads → deals
--   Escrita SÓ pelo servidor (service_role); `authenticated` só lê
--   (e só cadências/inscrições/eventos — caixas ficam server-only).
-- ============================================================

-- ------------------------------------------------------------
-- Contatos: campos usados pelas capturas (B2B) e pelo descadastro.
-- `phone` continua NOT NULL; contato B2B sem telefone grava '' (o índice
-- único de 022 ignora phone_normalized vazio).
-- ------------------------------------------------------------
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_unsubscribed_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS consent JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS job_title TEXT;
CREATE INDEX IF NOT EXISTS idx_contacts_account_email
  ON contacts (account_id, lower(email)) WHERE email IS NOT NULL;

-- ------------------------------------------------------------
-- CAIXAS DE ENVIO (SMTP por vendedor/conta) — server-only
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_mailboxes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  from_name TEXT NOT NULL DEFAULT '',
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- null = compartilhada
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER NOT NULL DEFAULT 587,
  smtp_security TEXT NOT NULL DEFAULT 'starttls',
  smtp_username TEXT NOT NULL DEFAULT '',
  smtp_password_encrypted TEXT,            -- lib/whatsapp/encryption.ts (AES-256-GCM)
  daily_limit INTEGER NOT NULL DEFAULT 50,
  verified_at TIMESTAMPTZ,
  last_error TEXT,
  signature_html TEXT NOT NULL DEFAULT '', -- já sanitizado
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_mailboxes_port_check CHECK (smtp_port BETWEEN 1 AND 65535),
  CONSTRAINT email_mailboxes_security_check CHECK (smtp_security IN ('starttls','tls','none')),
  CONSTRAINT email_mailboxes_daily_limit_check CHECK (daily_limit BETWEEN 1 AND 2000),
  CONSTRAINT email_mailboxes_host_check CHECK (smtp_host ~ '^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$'),
  CONSTRAINT email_mailboxes_email_check CHECK (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  CONSTRAINT email_mailboxes_signature_len_check CHECK (length(signature_html) <= 20000)
);
CREATE UNIQUE INDEX IF NOT EXISTS email_mailboxes_account_email_key
  ON email_mailboxes (account_id, lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS email_mailboxes_account_owner_key
  ON email_mailboxes (account_id, owner_user_id) WHERE owner_user_id IS NOT NULL;

ALTER TABLE email_mailboxes ENABLE ROW LEVEL SECURITY; -- SEM policies: só service_role
REVOKE ALL ON email_mailboxes FROM PUBLIC, anon, authenticated;
GRANT ALL ON email_mailboxes TO service_role;

DROP TRIGGER IF EXISTS set_updated_at ON email_mailboxes;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON email_mailboxes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- CADÊNCIAS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_cadences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'rascunho',
  configuracao JSONB NOT NULL DEFAULT '{}'::jsonb,
  passos JSONB NOT NULL DEFAULT '[]'::jsonb,
  versao INTEGER NOT NULL DEFAULT 1,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_cadences_status_check CHECK (status IN ('rascunho','ativa','pausada')),
  CONSTRAINT email_cadences_name_check CHECK (btrim(name) <> ''),
  CONSTRAINT email_cadences_passos_array CHECK (jsonb_typeof(passos) = 'array'),
  CONSTRAINT email_cadences_config_object CHECK (jsonb_typeof(configuracao) = 'object')
);
CREATE INDEX IF NOT EXISTS idx_email_cadences_account_status
  ON email_cadences (account_id, status, updated_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON email_cadences;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON email_cadences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- INSCRIÇÕES (um negócio dentro de uma cadência)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_cadence_enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  cadence_id UUID NOT NULL REFERENCES email_cadences(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ativa',
  motivo_parada TEXT,
  origem TEXT NOT NULL DEFAULT 'manual',
  inscrito_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  passo_atual_id TEXT,                   -- id do PRÓXIMO passo; null = ainda não começou
  proximo_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processando_ate TIMESTAMPTZ,           -- trava otimista (claim)
  ultimo_email_em TIMESTAMPTZ,
  ultimo_email_passo_id TEXT,
  emails_enviados INTEGER NOT NULL DEFAULT 0,
  aberturas INTEGER NOT NULL DEFAULT 0,
  cliques INTEGER NOT NULL DEFAULT 0,    -- reservado
  primeira_abertura_em TIMESTAMPTZ,
  ultima_abertura_em TIMESTAMPTZ,
  ultimo_clique_em TIMESTAMPTZ,          -- reservado
  tentativas INTEGER NOT NULL DEFAULT 0,
  ultimo_erro TEXT,
  concluida_em TIMESTAMPTZ,
  parada_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_cadence_enrollments_status_check CHECK (status IN ('ativa','concluida','parada')),
  CONSTRAINT email_cadence_enrollments_origem_check CHECK (origem IN ('manual','tag')),
  CONSTRAINT email_cadence_enrollments_motivo_check CHECK (
    motivo_parada IS NULL OR motivo_parada IN
      ('respondeu','bounce','descadastro','ganho_ou_perdido','manual','sem_email','falha')),
  CONSTRAINT email_cadence_enrollments_parada_consistente CHECK ((status = 'parada') = (motivo_parada IS NOT NULL)),
  CONSTRAINT email_cadence_enrollments_unica UNIQUE (cadence_id, deal_id)
);
CREATE INDEX IF NOT EXISTS idx_email_cadence_enrollments_vencidas
  ON email_cadence_enrollments (proximo_em) WHERE status = 'ativa';
CREATE INDEX IF NOT EXISTS idx_email_cadence_enrollments_deal
  ON email_cadence_enrollments (account_id, deal_id);
CREATE INDEX IF NOT EXISTS idx_email_cadence_enrollments_contact
  ON email_cadence_enrollments (account_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_email_cadence_enrollments_cadencia
  ON email_cadence_enrollments (cadence_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_cadence_enrollments_quentes
  ON email_cadence_enrollments (account_id, aberturas DESC, ultima_abertura_em DESC) WHERE aberturas >= 3;

DROP TRIGGER IF EXISTS set_updated_at ON email_cadence_enrollments;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON email_cadence_enrollments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- EVENTOS (linha do tempo)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_cadence_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  cadence_id UUID NOT NULL REFERENCES email_cadences(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES email_cadence_enrollments(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  passo_id TEXT,
  ator_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_cadence_events_tipo_check CHECK (tipo IN (
    'inscrito','reinscrito','email_enviado','email_falhou','aberto','clicado',
    'descadastrou','ramo_sim','ramo_nao','tarefa_criada','parada','concluida',
    'limite_diario_atingido','fora_da_janela'))
);
CREATE INDEX IF NOT EXISTS idx_email_cadence_events_cadencia
  ON email_cadence_events (cadence_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_cadence_events_inscricao
  ON email_cadence_events (enrollment_id, created_at DESC);
-- Contagem do teto diário por caixa (worker).
CREATE INDEX IF NOT EXISTS idx_email_cadence_events_envio_caixa
  ON email_cadence_events (account_id, (metadata->>'caixa_id'), created_at DESC) WHERE tipo = 'email_enviado';

-- ------------------------------------------------------------
-- RLS: tenant lê; só o servidor escreve
-- ------------------------------------------------------------
ALTER TABLE email_cadences ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_cadence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_cadence_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_cadences_select ON email_cadences;
CREATE POLICY email_cadences_select ON email_cadences FOR SELECT
  USING (is_account_member(account_id, 'viewer'));
DROP POLICY IF EXISTS email_cadence_enrollments_select ON email_cadence_enrollments;
CREATE POLICY email_cadence_enrollments_select ON email_cadence_enrollments FOR SELECT
  USING (is_account_member(account_id, 'viewer'));
DROP POLICY IF EXISTS email_cadence_events_select ON email_cadence_events;
CREATE POLICY email_cadence_events_select ON email_cadence_events FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

REVOKE ALL ON email_cadences, email_cadence_enrollments, email_cadence_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON email_cadences, email_cadence_enrollments, email_cadence_events TO authenticated;
GRANT ALL ON email_cadences, email_cadence_enrollments, email_cadence_events TO service_role;

-- ------------------------------------------------------------
-- Abertura atômica + dedupe.
-- Ignora nova abertura do MESMO passo na mesma inscrição em menos de
-- 60 s (pré-carregamento de imagem por proxy/antivírus costuma disparar
-- várias cargas em sequência). Devolve true se contou.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_cadencia_registrar_abertura(
  p_enrollment_id UUID,
  p_account_id UUID,
  p_passo_id TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_cadence UUID;
  v_deal UUID;
BEGIN
  SELECT cadence_id, deal_id INTO v_cadence, v_deal
  FROM email_cadence_enrollments
  WHERE id = p_enrollment_id AND account_id = p_account_id
  FOR UPDATE;                                   -- serializa aberturas simultâneas
  IF NOT FOUND THEN RETURN FALSE; END IF;

  IF EXISTS (
    SELECT 1 FROM email_cadence_events
    WHERE enrollment_id = p_enrollment_id
      AND tipo = 'aberto'
      AND passo_id IS NOT DISTINCT FROM p_passo_id
      AND created_at > NOW() - INTERVAL '60 seconds'
  ) THEN
    RETURN FALSE;
  END IF;

  UPDATE email_cadence_enrollments
     SET aberturas = aberturas + 1,
         primeira_abertura_em = COALESCE(primeira_abertura_em, NOW()),
         ultima_abertura_em = NOW()
   WHERE id = p_enrollment_id;

  INSERT INTO email_cadence_events (account_id, cadence_id, enrollment_id, deal_id, tipo, passo_id)
  VALUES (p_account_id, v_cadence, p_enrollment_id, v_deal, 'aberto', p_passo_id);
  RETURN TRUE;
END;
$$;
REVOKE EXECUTE ON FUNCTION fn_cadencia_registrar_abertura(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_cadencia_registrar_abertura(UUID, UUID, TEXT) TO service_role;
