-- Analisar Deals (botão no funil que ordena os negócios por atenção).
--
--  integration_keys           libera o provedor 'analisar_deals' (chave do serviço de IA da
--                             análise). A 030/039/040 limitam provider por CHECK; sem isto
--                             salvar a chave falha.
--  analisar_deals_config      pesos e limites da conta (um JSON por conta). Membros leem,
--                             só admin+ grava (mesmo molde de `ai_company_profile`, 041).
--  analisar_deals_cache       respostas da IA por negócio e pergunta, para trocar os critérios
--                             do modal sem chamar o serviço de novo. Só o servidor (service
--                             role) acessa: RLS ligada e nenhuma policy, como `integration_keys`.
--
-- Idempotente.
ALTER TABLE integration_keys DROP CONSTRAINT IF EXISTS integration_keys_provider_check;
ALTER TABLE integration_keys ADD CONSTRAINT integration_keys_provider_check
  CHECK (provider IN ('apify', 'treg', 'openrouter', 'firecrawl', 'analisar_deals'));

-- ------------------------------------------------------------
-- Pesos e limites
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analisar_deals_config (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT analisar_deals_config_objeto_check CHECK (jsonb_typeof(config) = 'object')
);

ALTER TABLE analisar_deals_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS analisar_deals_config_select ON analisar_deals_config;
DROP POLICY IF EXISTS analisar_deals_config_insert ON analisar_deals_config;
DROP POLICY IF EXISTS analisar_deals_config_update ON analisar_deals_config;
CREATE POLICY analisar_deals_config_select ON analisar_deals_config FOR SELECT USING (is_account_member(account_id));
CREATE POLICY analisar_deals_config_insert ON analisar_deals_config FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY analisar_deals_config_update ON analisar_deals_config FOR UPDATE USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON analisar_deals_config;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON analisar_deals_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- Cache das respostas da IA
-- ------------------------------------------------------------
-- `hash` identifica o texto enviado (e a versão das perguntas): se o negócio mudou, a
-- resposta guardada deixa de valer. Uma linha por (conta, negócio, pergunta).
CREATE TABLE IF NOT EXISTS analisar_deals_cache (
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  pergunta TEXT NOT NULL,
  hash TEXT NOT NULL,
  resposta JSONB NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, deal_id, pergunta),
  CONSTRAINT analisar_deals_cache_objeto_check CHECK (jsonb_typeof(resposta) = 'object')
);

ALTER TABLE analisar_deals_cache ENABLE ROW LEVEL SECURITY;
