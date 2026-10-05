-- Chaves de API por conta: libera o provedor 'openrouter' (modelo gratuito openrouter/free).
-- A 030 criou a coluna com CHECK (provider IN ('apify','treg')); sem esta migration
-- salvar a chave do OpenRouter falha.
--
-- Idempotente.
ALTER TABLE integration_keys DROP CONSTRAINT IF EXISTS integration_keys_provider_check;
ALTER TABLE integration_keys ADD CONSTRAINT integration_keys_provider_check
  CHECK (provider IN ('apify', 'treg', 'openrouter'));
