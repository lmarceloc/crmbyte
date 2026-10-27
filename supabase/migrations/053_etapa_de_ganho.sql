-- 053_etapa_de_ganho — etapa do funil marcada como "ganho" (troféu no Manage Pipeline).
--   Arrastar um negócio para ela solta confete na tela. Não muda o status do negócio.
--   Etapas que já se chamam "Ganho"/"Won" (e parecidos) já entram marcadas.

ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS is_won BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE pipeline_stages
   SET is_won = TRUE
 WHERE lower(trim(name)) IN ('won', 'closed won', 'ganho', 'ganhos', 'fechado ganho', 'venda fechada', 'vendido');
