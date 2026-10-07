-- Chaves de acesso à API do CRM, para sistemas externos MANDAREM dados para cá
-- (n8n, Apollo, formulários...). Diferente de `integration_keys`, que guarda as
-- chaves que o CRM usa para chamar serviços de fora.
--
-- A chave identifica a CONTA: quem chama não manda account_id. Só o hash SHA-256
-- fica gravado; o texto puro aparece uma única vez, na criação. `user_id` é quem
-- figura como dono dos contatos criados pela chave.
--
-- Idempotente.
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  key_hash TEXT NOT NULL UNIQUE,
  key_hint TEXT NOT NULL,              -- últimos caracteres, só para identificar
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_api_keys_account ON api_keys (account_id);
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON api_keys FROM anon, authenticated;
GRANT ALL ON api_keys TO service_role;
