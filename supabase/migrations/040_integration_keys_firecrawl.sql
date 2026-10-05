-- Chaves de API por conta: libera o provedor 'firecrawl'.
-- A 030/039 limitam integration_keys.provider por CHECK; sem esta migration
-- salvar a chave do Firecrawl falha.
--
-- Idempotente.
ALTER TABLE integration_keys DROP CONSTRAINT IF EXISTS integration_keys_provider_check;
ALTER TABLE integration_keys ADD CONSTRAINT integration_keys_provider_check
  CHECK (provider IN ('apify', 'treg', 'openrouter', 'firecrawl'));
