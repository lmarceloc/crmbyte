-- Data em que o negócio entrou na etapa atual do funil (indicador
-- "dias na etapa" no cartão do pipeline).
--
-- Mantida por trigger para cobrir TODOS os caminhos que mexem em
-- stage_id (arrastar no quadro, formulário, automações, importação da
-- prospecção, negócio criado pela empresa) sem depender do cliente.
-- Também impede que o valor seja alterado à mão: num UPDATE que não
-- troca de etapa, o valor antigo é preservado.
--
-- Idempotente.

ALTER TABLE deals ADD COLUMN IF NOT EXISTS stage_entered_at TIMESTAMPTZ;

-- Negócios existentes: não há histórico de etapas, então usa a última
-- atualização como melhor aproximação (mesma regra da migration 029).
UPDATE deals SET stage_entered_at = COALESCE(updated_at, created_at, now())
 WHERE stage_entered_at IS NULL;

ALTER TABLE deals ALTER COLUMN stage_entered_at SET DEFAULT now();
ALTER TABLE deals ALTER COLUMN stage_entered_at SET NOT NULL;

CREATE OR REPLACE FUNCTION fn_deal_stage_entered_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.stage_entered_at := now();
  ELSIF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    NEW.stage_entered_at := now();
  ELSE
    NEW.stage_entered_at := OLD.stage_entered_at;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION fn_deal_stage_entered_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_deal_stage_entered_at ON deals;
CREATE TRIGGER trg_deal_stage_entered_at BEFORE INSERT OR UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION fn_deal_stage_entered_at();
