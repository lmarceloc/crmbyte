-- ============================================================
-- 055_cadence_interest_path — caminho de interesse na cadência
--
-- configuracao->'interesse' = { ativo, aberturas, avisarVendedor, passos }:
-- quando o lead abre `aberturas` vezes o MESMO e-mail, o worker o tira do
-- fluxo principal e segue os passos do caminho de interesse (e cria uma
-- tarefa de alerta para o vendedor).
--
--   * novo tipo de evento 'interesse_detectado';
--   * fn_cadencia_registrar_abertura passa a "acordar" a inscrição
--     (proximo_em = agora) quando a abertura atinge o número da cadência:
--     o lead não espera o fim de uma Espera longa para ir para o caminho.
--     Quem decide e move é o worker; aqui só se antecipa a próxima rodada
--     (uma vez só: depois do desvio, novas aberturas não aceleram o caminho).
--
-- Idempotente.
-- ============================================================

ALTER TABLE email_cadence_events DROP CONSTRAINT IF EXISTS email_cadence_events_tipo_check;
ALTER TABLE email_cadence_events ADD CONSTRAINT email_cadence_events_tipo_check CHECK (tipo IN (
  'inscrito','reinscrito','email_enviado','email_falhou','aberto','clicado',
  'descadastrou','ramo_sim','ramo_nao','tarefa_criada','parada','concluida',
  'limite_diario_atingido','fora_da_janela','resultado_marcado',
  'respondido','bounce','negocio_criado','interesse_detectado'));

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
  v_status TEXT;
  v_limiar INTEGER;
  v_config JSONB;
  v_status_cadencia TEXT;
  v_aberturas_interesse INTEGER;
  v_aberturas_do_email INTEGER;
BEGIN
  SELECT cadence_id, deal_id, status INTO v_cadence, v_deal, v_status
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

  SELECT configuracao, status INTO v_config, v_status_cadencia
  FROM email_cadences WHERE id = v_cadence;
  v_limiar := fn_cadencia_limiar_quente(v_config);

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

  -- caminho de interesse: atingiu o número de aberturas neste e-mail → worker já no próximo minuto
  IF v_status = 'ativa'
     AND v_status_cadencia = 'ativa'
     AND (v_config -> 'interesse' ->> 'ativo') = 'true'
     AND jsonb_typeof(v_config -> 'interesse' -> 'aberturas') = 'number'
     -- o caminho tem o que fazer (senão o worker não desvia e só anteciparia o passo atual)
     AND jsonb_typeof(v_config -> 'interesse' -> 'passos') = 'array'
     AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_config -> 'interesse' -> 'passos') AS p(passo)
       WHERE p.passo ->> 'tipo' <> 'fim'
     )
     -- já foi desviado: não acorda de novo (pularia as esperas do caminho de interesse)
     AND NOT EXISTS (
       SELECT 1 FROM email_cadence_events
       WHERE enrollment_id = p_enrollment_id AND tipo = 'interesse_detectado'
     ) THEN
    v_aberturas_interesse := GREATEST(1, floor((v_config -> 'interesse' ->> 'aberturas')::numeric)::int);
    SELECT count(*) INTO v_aberturas_do_email
    FROM email_cadence_events
    WHERE enrollment_id = p_enrollment_id
      AND tipo = 'aberto'
      AND passo_id IS NOT DISTINCT FROM p_passo_id;
    IF v_aberturas_do_email >= v_aberturas_interesse THEN
      UPDATE email_cadence_enrollments
         SET proximo_em = LEAST(proximo_em, NOW())
       WHERE id = p_enrollment_id;
    END IF;
  END IF;

  RETURN TRUE;
END;
$$;
REVOKE EXECUTE ON FUNCTION fn_cadencia_registrar_abertura(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_cadencia_registrar_abertura(UUID, UUID, TEXT) TO service_role;
