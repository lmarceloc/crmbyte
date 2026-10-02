-- Chaves de API de serviços externos por conta (cifradas; só o service role lê).
CREATE TABLE IF NOT EXISTS integration_keys (
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('apify', 'treg')),
  credential_encrypted TEXT NOT NULL,
  key_hint TEXT,                       -- últimos caracteres, só para identificar
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, provider)
);
ALTER TABLE integration_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON integration_keys FROM anon, authenticated;
GRANT ALL ON integration_keys TO service_role;

INSERT INTO integration_keys (account_id, provider, credential_encrypted)
SELECT account_id, 'apify', credential_encrypted FROM prospecting_settings
ON CONFLICT DO NOTHING;
