-- ============================================================
-- 050_cadence_enroll_contacts — inscrição por CONTATO, negócio opcional
--
-- Antes: só negócios entravam na cadência, então o pipeline enchia de
-- negócios que nunca iam evoluir. Agora o contato (ou os contatos de uma
-- empresa) entra direto; o vendedor cria o negócio quando o lead der sinal
-- (botão "Criar negócio" na inscrição), no funil/etapa da cadência.
--
--   email_cadence_enrollments.deal_id  NOT NULL → NULL
--   email_cadence_events.deal_id       NOT NULL → NULL
--   unicidade (cadência, negócio, contato) trata NULL como igual
--   novo evento 'negocio_criado'
-- Idempotente.
-- ============================================================

ALTER TABLE email_cadence_enrollments ALTER COLUMN deal_id DROP NOT NULL;
ALTER TABLE email_cadence_events ALTER COLUMN deal_id DROP NOT NULL;

-- Sem NULLS NOT DISTINCT o mesmo contato entraria duas vezes sem negócio.
ALTER TABLE email_cadence_enrollments DROP CONSTRAINT IF EXISTS email_cadence_enrollments_unica;
ALTER TABLE email_cadence_enrollments
  ADD CONSTRAINT email_cadence_enrollments_unica UNIQUE NULLS NOT DISTINCT (cadence_id, deal_id, contact_id);

ALTER TABLE email_cadence_events DROP CONSTRAINT IF EXISTS email_cadence_events_tipo_check;
ALTER TABLE email_cadence_events ADD CONSTRAINT email_cadence_events_tipo_check CHECK (tipo IN (
  'inscrito','reinscrito','email_enviado','email_falhou','aberto','clicado',
  'descadastrou','ramo_sim','ramo_nao','tarefa_criada','parada','concluida',
  'limite_diario_atingido','fora_da_janela','resultado_marcado',
  'respondido','bounce','negocio_criado'));
