-- ============================================================
-- 042_cadence_reply_bounce_tracking — resposta e bounce pela caixa de entrada
--
-- O worker passa a LER a caixa de entrada das caixas de envio que têm IMAP
-- (mesmo servidor/usuário/senha da cópia em "Enviados", migração 038):
--   * resposta do lead  → evento 'respondido', inscrição.respondeu_em e,
--     se a cadência para em resposta, status 'parada' motivo 'respondeu';
--   * bounce (devolução) → evento 'bounce', inscrição.bounce_em,
--     contato.email_bounced_at e, se a cadência para em bounce, 'parada'.
-- A mensagem é casada pelo Message-ID que já gravamos em cada envio
-- (metadata->>'message_id' do evento 'email_enviado').
--
-- Idempotente.
-- ============================================================

-- Caixa: onde parou a leitura da entrada (UID do IMAP) e o último erro.
ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS imap_copy_sent BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS imap_inbox_uid_validity BIGINT;
ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS imap_inbox_last_uid BIGINT;
ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS imap_inbox_checked_at TIMESTAMPTZ;
ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS imap_inbox_error TEXT;

-- Inscrição: quando respondeu / quando o e-mail voltou.
ALTER TABLE email_cadence_enrollments ADD COLUMN IF NOT EXISTS respondeu_em TIMESTAMPTZ;
ALTER TABLE email_cadence_enrollments ADD COLUMN IF NOT EXISTS bounce_em TIMESTAMPTZ;

-- Contato: endereço que voltou (não adianta mandar de novo).
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_bounced_at TIMESTAMPTZ;

-- Trocou o e-mail do contato: o bounce era do endereço antigo.
CREATE OR REPLACE FUNCTION fn_contacts_limpar_bounce()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.email_bounced_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS contacts_limpar_bounce ON contacts;
CREATE TRIGGER contacts_limpar_bounce BEFORE UPDATE OF email ON contacts
  FOR EACH ROW EXECUTE FUNCTION fn_contacts_limpar_bounce();

-- Novos tipos de evento (lista de 026 + 'respondido' e 'bounce').
ALTER TABLE email_cadence_events DROP CONSTRAINT IF EXISTS email_cadence_events_tipo_check;
ALTER TABLE email_cadence_events ADD CONSTRAINT email_cadence_events_tipo_check CHECK (tipo IN (
  'inscrito','reinscrito','email_enviado','email_falhou','aberto','clicado',
  'descadastrou','ramo_sim','ramo_nao','tarefa_criada','parada','concluida',
  'limite_diario_atingido','fora_da_janela','resultado_marcado',
  'respondido','bounce'));

-- Achar o envio pelo Message-ID de uma resposta ou devolução.
CREATE INDEX IF NOT EXISTS idx_email_cadence_events_message_id
  ON email_cadence_events (account_id, (metadata->>'message_id'))
  WHERE tipo = 'email_enviado';
