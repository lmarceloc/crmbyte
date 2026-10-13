-- 048_resumo_semanal — e-mail semanal de resumo para dono/admin da conta.
--   * tarefas.adiada_em / adiamentos: o prazo de uma tarefa pendente foi empurrado para frente
--     (o resumo conta as "adiadas" da semana).
--   * resumos_semanais: uma linha por (conta, semana) já enviada — o envio é idempotente.

ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS adiada_em TIMESTAMPTZ;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS adiamentos INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION fn_tarefas_marcar_adiada() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status = 'pendente' AND OLD.prazo_em IS NOT NULL AND NEW.prazo_em > OLD.prazo_em THEN
    NEW.adiada_em := NOW();
    NEW.adiamentos := OLD.adiamentos + 1;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_tarefas_marcar_adiada ON tarefas;
CREATE TRIGGER trg_tarefas_marcar_adiada BEFORE UPDATE OF prazo_em ON tarefas
  FOR EACH ROW EXECUTE FUNCTION fn_tarefas_marcar_adiada();

CREATE TABLE IF NOT EXISTS resumos_semanais (
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  semana_inicio DATE NOT NULL,
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  destinatarios INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, semana_inicio)
);
-- Só o service role (worker) lê e grava.
ALTER TABLE resumos_semanais ENABLE ROW LEVEL SECURITY;
