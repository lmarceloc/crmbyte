-- Motivo de perda e data de fechamento dos negócios (relatório por empresa).
ALTER TABLE deals ADD COLUMN IF NOT EXISTS lost_reason TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS lost_note TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Negócios já fechados: usa a última atualização como melhor aproximação.
UPDATE deals SET closed_at = COALESCE(updated_at, created_at)
 WHERE status IN ('won', 'lost') AND closed_at IS NULL;

CREATE OR REPLACE FUNCTION fn_deal_fechamento() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('won', 'lost') THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR NEW.closed_at IS NULL THEN
      NEW.closed_at := now();
    END IF;
    IF NEW.status = 'won' THEN
      NEW.lost_reason := NULL;
      NEW.lost_note := NULL;
    END IF;
  ELSE
    NEW.closed_at := NULL;
    NEW.lost_reason := NULL;
    NEW.lost_note := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_deal_fechamento ON deals;
CREATE TRIGGER trg_deal_fechamento BEFORE INSERT OR UPDATE OF status ON deals
  FOR EACH ROW EXECUTE FUNCTION fn_deal_fechamento();

CREATE INDEX IF NOT EXISTS idx_deals_company_status ON deals (company_id, status);
