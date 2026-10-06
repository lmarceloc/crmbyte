-- ============================================================
-- 044_cadence_loose_steps — caixas soltas no canvas da cadência
--
-- O fluxo passa a ser montado à mão: clicar na paleta cria a caixa SOLTA no
-- canvas; arrastar da saída de uma caixa até a entrada de outra liga as duas.
-- As caixas ainda não ligadas ao fluxo ficam aqui (lista de blocos
-- { id, x, y, passos[] }), para não se perderem ao sair da página.
-- O worker ignora esta coluna: só `passos` (o que está ligado ao gatilho) roda.
-- A ativação é recusada enquanto houver caixa solta.
--
-- Idempotente.
-- ============================================================
ALTER TABLE email_cadences ADD COLUMN IF NOT EXISTS soltos JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE email_cadences DROP CONSTRAINT IF EXISTS email_cadences_soltos_array;
ALTER TABLE email_cadences ADD CONSTRAINT email_cadences_soltos_array CHECK (jsonb_typeof(soltos) = 'array');
