-- Caixa de envio: cópia da mensagem na pasta "Enviados" via IMAP.
--
-- O SMTP só ENTREGA a mensagem; guardar uma cópia na caixa do remetente é
-- trabalho do cliente de e-mail (IMAP APPEND) e muitos provedores (ex.: Umbler)
-- não fazem isso sozinhos — o e-mail da cadência saía e não aparecia em
-- "Enviados". Com `imap_host` preenchido, o worker grava a cópia depois de
-- enviar. Usuário e senha são os mesmos do SMTP (smtp_username /
-- smtp_password_encrypted; sem usuário, vale o e-mail da caixa).
--
--   imap_host         NULL = recurso desligado (comportamento de antes)
--   imap_sent_folder  NULL = detecta a pasta (\Sent) sozinho
--   imap_last_error   último erro ao copiar; o envio NUNCA falha por isso
--
-- Gmail e Outlook já guardam a cópia sozinhos: deixe o IMAP em branco neles
-- para não duplicar. Tabela server-only (sem policies), como o resto da 024.
--
-- Idempotente.
ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS imap_host TEXT;
ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS imap_port INTEGER NOT NULL DEFAULT 993;
ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS imap_security TEXT NOT NULL DEFAULT 'tls';
ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS imap_sent_folder TEXT;
ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS imap_last_error TEXT;

ALTER TABLE email_mailboxes DROP CONSTRAINT IF EXISTS email_mailboxes_imap_host_check;
ALTER TABLE email_mailboxes ADD CONSTRAINT email_mailboxes_imap_host_check
  CHECK (imap_host IS NULL OR imap_host ~ '^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$');
ALTER TABLE email_mailboxes DROP CONSTRAINT IF EXISTS email_mailboxes_imap_port_check;
ALTER TABLE email_mailboxes ADD CONSTRAINT email_mailboxes_imap_port_check
  CHECK (imap_port BETWEEN 1 AND 65535);
ALTER TABLE email_mailboxes DROP CONSTRAINT IF EXISTS email_mailboxes_imap_security_check;
ALTER TABLE email_mailboxes ADD CONSTRAINT email_mailboxes_imap_security_check
  CHECK (imap_security IN ('tls','starttls'));
ALTER TABLE email_mailboxes DROP CONSTRAINT IF EXISTS email_mailboxes_imap_sent_folder_check;
ALTER TABLE email_mailboxes ADD CONSTRAINT email_mailboxes_imap_sent_folder_check
  CHECK (imap_sent_folder IS NULL OR length(imap_sent_folder) <= 200);
