-- ============================================================
-- 043_hot_lead_threshold_per_cadence — "lead quente" com limite por cadência
--
-- Antes: lead quente = 3+ aberturas, fixo no código. Agora cada cadência
-- define o próprio limite em configuracao->>'limiarLeadQuente' (padrão 2,
-- de 1 a 50). A inscrição guarda QUANDO ficou quente (`quente_em`):
--   * a abertura atômica (fn_cadencia_registrar_abertura) marca ao atingir;
--   * mudar o limite da cadência reclassifica as inscrições dela (trigger);
--   * as inscrições existentes são classificadas aqui (backfill).
-- A lista de leads quentes passa a filtrar `quente_em IS NOT NULL`.
--
-- Idempotente.
-- ============================================================

ALTER TABLE email_cadence_enrollments ADD COLUMN IF NOT EXISTS quente_em TIMESTAMPTZ;

-- Limite da cadência, tolerante a JSON ausente/estranho (padrão 2, faixa 1–50).
CREATE OR REPLACE FUNCTION fn_cadencia_limiar_quente(p_config JSONB)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN jsonb_typeof(p_config -> 'limiarLeadQuente') = 'number'
      THEN LEAST(50, GREATEST(1, floor((p_config ->> 'limiarLeadQuente')::numeric)::int))
    ELSE 2
  END;
$$;

-- Backfill: quem já tem aberturas suficientes fica quente desde a última abertura.
UPDATE email_cadence_enrollments e
   SET quente_em = COALESCE(e.ultima_abertura_em, e.updated_at, NOW())
  FROM email_cadences c
 WHERE c.id = e.cadence_id
   AND e.quente_em IS NULL
   AND e.aberturas >= fn_cadencia_limiar_quente(c.configuracao);

-- Abertura atômica + dedupe (mesma de 024) + marca de "quente" ao atingir o limite.
CREATE OR REPLACE FUNCTION fn_cadencia_registrar_abertura(
  p_enrollment_id UUID,
  p_account_id UUID,
  p_passo_id TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_cadence UUID;
  v_deal UUID;
  v_limiar INTEGER;
BEGIN
  SELECT cadence_id, deal_id INTO v_cadence, v_deal
  FROM email_cadence_enrollments
  WHERE id = p_enrollment_id AND account_id = p_account_id
  FOR UPDATE;                                   -- serializa aberturas simultâneas
  IF NOT FOUND THEN RETURN FALSE; END IF;

  IF EXISTS (
    SELECT 1 FROM email_cadence_events
    WHERE enrollment_id = p_enrollment_id
      AND tipo = 'aberto'
      AND passo_id IS NOT DISTINCT FROM p_passo_id
      AND created_at > NOW() - INTERVAL '60 seconds'
  ) THEN
    RETURN FALSE;
  END IF;

  SELECT fn_cadencia_limiar_quente(configuracao) INTO v_limiar
  FROM email_cadences WHERE id = v_cadence;

  UPDATE email_cadence_enrollments
     SET aberturas = aberturas + 1,
         primeira_abertura_em = COALESCE(primeira_abertura_em, NOW()),
         ultima_abertura_em = NOW(),
         quente_em = CASE
           WHEN quente_em IS NULL AND aberturas + 1 >= COALESCE(v_limiar, 2) THEN NOW()
           ELSE quente_em
         END
   WHERE id = p_enrollment_id;

  INSERT INTO email_cadence_events (account_id, cadence_id, enrollment_id, deal_id, tipo, passo_id)
  VALUES (p_account_id, v_cadence, p_enrollment_id, v_deal, 'aberto', p_passo_id);
  RETURN TRUE;
END;
$$;
REVOKE EXECUTE ON FUNCTION fn_cadencia_registrar_abertura(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_cadencia_registrar_abertura(UUID, UUID, TEXT) TO service_role;

-- Mudou o limite da cadência: reclassifica as inscrições dela.
CREATE OR REPLACE FUNCTION fn_cadencia_reclassificar_quentes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_novo INTEGER := fn_cadencia_limiar_quente(NEW.configuracao);
BEGIN
  IF v_novo = fn_cadencia_limiar_quente(OLD.configuracao) THEN
    RETURN NEW;
  END IF;
  UPDATE email_cadence_enrollments
     SET quente_em = CASE
           WHEN aberturas >= v_novo THEN COALESCE(quente_em, ultima_abertura_em, NOW())
           ELSE NULL
         END
   WHERE cadence_id = NEW.id
     AND ((aberturas >= v_novo AND quente_em IS NULL) OR (aberturas < v_novo AND quente_em IS NOT NULL));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS email_cadences_reclassificar_quentes ON email_cadences;
CREATE TRIGGER email_cadences_reclassificar_quentes AFTER UPDATE OF configuracao ON email_cadences
  FOR EACH ROW EXECUTE FUNCTION fn_cadencia_reclassificar_quentes();

-- Índice da lista de leads quentes (o antigo era "aberturas >= 3").
DROP INDEX IF EXISTS idx_email_cadence_enrollments_quentes;
CREATE INDEX IF NOT EXISTS idx_email_cadence_enrollments_quente_em
  ON email_cadence_enrollments (account_id, quente_em DESC) WHERE quente_em IS NOT NULL;
