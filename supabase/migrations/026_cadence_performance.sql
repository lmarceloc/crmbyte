-- ============================================================
-- 026_cadence_performance — resultado do lead, clique e métricas
-- ============================================================

-- Resultado marcado à mão pelo vendedor.
ALTER TABLE email_cadence_enrollments ADD COLUMN IF NOT EXISTS resultado TEXT;
ALTER TABLE email_cadence_enrollments ADD COLUMN IF NOT EXISTS resultado_em TIMESTAMPTZ;
ALTER TABLE email_cadence_enrollments ADD COLUMN IF NOT EXISTS resultado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE email_cadence_enrollments DROP CONSTRAINT IF EXISTS email_cadence_enrollments_resultado_check;
ALTER TABLE email_cadence_enrollments ADD CONSTRAINT email_cadence_enrollments_resultado_check
  CHECK (resultado IS NULL OR resultado IN ('com_interesse','sem_interesse','agendado'));

ALTER TABLE email_cadence_events DROP CONSTRAINT IF EXISTS email_cadence_events_tipo_check;
ALTER TABLE email_cadence_events ADD CONSTRAINT email_cadence_events_tipo_check CHECK (tipo IN (
  'inscrito','reinscrito','email_enviado','email_falhou','aberto','clicado',
  'descadastrou','ramo_sim','ramo_nao','tarefa_criada','parada','concluida',
  'limite_diario_atingido','fora_da_janela','resultado_marcado'));

-- Clique atômico + dedupe (60 s, mesma URL): scanners de link disparam em rajada.
CREATE OR REPLACE FUNCTION fn_cadencia_registrar_clique(
  p_enrollment_id UUID, p_account_id UUID, p_passo_id TEXT, p_url TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  v_cadence UUID;
  v_deal UUID;
BEGIN
  SELECT cadence_id, deal_id INTO v_cadence, v_deal
  FROM email_cadence_enrollments
  WHERE id = p_enrollment_id AND account_id = p_account_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF EXISTS (
    SELECT 1 FROM email_cadence_events
    WHERE enrollment_id = p_enrollment_id AND tipo = 'clicado'
      AND metadata->>'url' = p_url
      AND created_at > NOW() - INTERVAL '60 seconds'
  ) THEN
    RETURN FALSE;
  END IF;
  UPDATE email_cadence_enrollments
     SET cliques = cliques + 1, ultimo_clique_em = NOW()
   WHERE id = p_enrollment_id;
  INSERT INTO email_cadence_events (account_id, cadence_id, enrollment_id, deal_id, tipo, passo_id, metadata)
  VALUES (p_account_id, v_cadence, p_enrollment_id, v_deal, 'clicado', p_passo_id, jsonb_build_object('url', p_url));
  RETURN TRUE;
END;
$$;
REVOKE EXECUTE ON FUNCTION fn_cadencia_registrar_clique(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_cadencia_registrar_clique(UUID, UUID, TEXT, TEXT) TO service_role;

-- Métricas. SECURITY INVOKER: a RLS do chamador decide o que ele enxerga.
-- Funil por INSCRIÇÃO (cada lead conta uma vez por etapa).
CREATE OR REPLACE FUNCTION fn_cadencia_desempenho(
  p_cadence UUID DEFAULT NULL,
  p_de TIMESTAMPTZ DEFAULT NULL,
  p_ate TIMESTAMPTZ DEFAULT NULL,
  p_por UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  WITH base AS (
    SELECT e.* FROM email_cadence_enrollments e
    WHERE (p_cadence IS NULL OR e.cadence_id = p_cadence)
      AND (p_de IS NULL OR e.created_at >= p_de)
      AND (p_ate IS NULL OR e.created_at < p_ate)
      AND (p_por IS NULL OR e.inscrito_por = p_por)
  ), por_cad AS (
    SELECT c.id, c.name,
      count(b.id) AS inscritos,
      count(*) FILTER (WHERE b.emails_enviados > 0) AS enviados,
      count(*) FILTER (WHERE b.aberturas > 0) AS abertos,
      count(*) FILTER (WHERE b.cliques > 0) AS clicados,
      count(*) FILTER (WHERE b.resultado = 'com_interesse') AS com_interesse,
      count(*) FILTER (WHERE b.resultado = 'sem_interesse') AS sem_interesse,
      count(*) FILTER (WHERE b.resultado = 'agendado') AS agendado
    FROM base b JOIN email_cadences c ON c.id = b.cadence_id
    GROUP BY c.id, c.name
  )
  SELECT jsonb_build_object(
    'inscritos',     (SELECT count(*) FROM base),
    'enviados',      (SELECT count(*) FROM base WHERE emails_enviados > 0),
    'abertos',       (SELECT count(*) FROM base WHERE aberturas > 0),
    'clicados',      (SELECT count(*) FROM base WHERE cliques > 0),
    'com_interesse', (SELECT count(*) FROM base WHERE resultado = 'com_interesse'),
    'sem_interesse', (SELECT count(*) FROM base WHERE resultado = 'sem_interesse'),
    'agendado',      (SELECT count(*) FROM base WHERE resultado = 'agendado'),
    'emails_enviados_total', (SELECT COALESCE(sum(emails_enviados), 0) FROM base),
    'aberturas_total',       (SELECT COALESCE(sum(aberturas), 0) FROM base),
    'cliques_total',         (SELECT COALESCE(sum(cliques), 0) FROM base),
    'descadastros',  (SELECT count(*) FROM base WHERE motivo_parada = 'descadastro'),
    'falhas',        (SELECT count(*) FROM base WHERE motivo_parada = 'falha'),
    'por_cadencia',  COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.inscritos DESC) FROM por_cad p), '[]'::jsonb)
  );
$$;
GRANT EXECUTE ON FUNCTION fn_cadencia_desempenho(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION fn_cadencia_desempenho(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID) FROM anon, PUBLIC;
