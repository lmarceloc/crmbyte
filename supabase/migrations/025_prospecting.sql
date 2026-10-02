-- ============================================================
-- 025_prospecting — captura de leads (B2B/Treg e busca simples/Apify)
--
-- Idempotent. Tudo server-only: RLS ligada, sem GRANT a anon/authenticated.
-- As rotas resolvem a conta pela sessão e filtram account_id à mão.
-- ============================================================

-- Origem do negócio (dedupe da importação: source='prospecting' + external_id)
ALTER TABLE deals ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_prospecting_external
  ON deals (account_id, external_id) WHERE source = 'prospecting' AND external_id IS NOT NULL;

-- Chave Apify por conta (cifrada)
CREATE TABLE IF NOT EXISTS prospecting_settings (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  credential_encrypted TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prospecting_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  request_id UUID NOT NULL,                       -- idempotência
  name TEXT NOT NULL,
  search JSONB NOT NULL,
  kind TEXT NOT NULL DEFAULT 'simples' CHECK (kind IN ('simples','b2b')),
  search_status TEXT NOT NULL DEFAULT 'starting'
    CHECK (search_status IN ('starting','running','succeeded','failed','unknown')),
  run_id TEXT,
  dataset_id TEXT,
  cost_usd NUMERIC,
  result_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, request_id)
);
CREATE INDEX IF NOT EXISTS idx_prospecting_campaigns_account
  ON prospecting_campaigns (account_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospecting_campaigns_pending
  ON prospecting_campaigns (search_status, updated_at) WHERE search_status IN ('starting','running');

CREATE TABLE IF NOT EXISTS prospecting_candidates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL,
  place_id TEXT NOT NULL,                         -- chave de dedupe (placeId / lead.key)
  phone TEXT,                                     -- só simples
  data JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','skipped','failed','enriched')),
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (account_id, campaign_id)
    REFERENCES prospecting_campaigns (account_id, id) ON DELETE CASCADE,
  UNIQUE (account_id, place_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_prospecting_candidates_phone
  ON prospecting_candidates (account_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prospecting_candidates_campaign
  ON prospecting_candidates (campaign_id, status);

-- Lock por conta (serializa busca, worker e importação). Lease com validade,
-- porque o PostgREST não segura advisory lock de sessão entre chamadas.
CREATE TABLE IF NOT EXISTS prospecting_locks (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  locked_until TIMESTAMPTZ NOT NULL,
  holder UUID NOT NULL
);

CREATE OR REPLACE FUNCTION fn_prospecting_acquire_lock(p_account_id UUID, p_holder UUID, p_seconds INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_rows INTEGER;
BEGIN
  INSERT INTO prospecting_locks (account_id, locked_until, holder)
  VALUES (p_account_id, NOW() + make_interval(secs => p_seconds), p_holder)
  ON CONFLICT (account_id) DO UPDATE
    SET locked_until = EXCLUDED.locked_until, holder = EXCLUDED.holder
    WHERE prospecting_locks.locked_until < NOW();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

CREATE OR REPLACE FUNCTION fn_prospecting_release_lock(p_account_id UUID, p_holder UUID)
RETURNS VOID
LANGUAGE sql
SET search_path = public
AS $$
  DELETE FROM prospecting_locks WHERE account_id = p_account_id AND holder = p_holder;
$$;

ALTER TABLE prospecting_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospecting_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospecting_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospecting_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON prospecting_settings, prospecting_campaigns, prospecting_candidates, prospecting_locks
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON prospecting_settings, prospecting_campaigns, prospecting_candidates, prospecting_locks TO service_role;
REVOKE EXECUTE ON FUNCTION fn_prospecting_acquire_lock(UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_prospecting_release_lock(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_prospecting_acquire_lock(UUID, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION fn_prospecting_release_lock(UUID, UUID) TO service_role;

DROP TRIGGER IF EXISTS set_updated_at ON prospecting_campaigns;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON prospecting_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at ON prospecting_candidates;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON prospecting_candidates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
