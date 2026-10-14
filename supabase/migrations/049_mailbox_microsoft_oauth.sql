-- 049_mailbox_microsoft_oauth — caixa conectada pelo login da Microsoft (OAuth + Graph).
--   provedor = 'smtp' (como antes) | 'microsoft' (envia por Microsoft Graph, sem senha).
--   Tokens cifrados (lib/whatsapp/encryption.ts), como a senha SMTP. A tabela já é só
--   service_role (sem policies), então nada disso chega ao navegador.
--   Numa caixa 'microsoft', smtp_host guarda 'graph.microsoft.com' (só informativo).

ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS provedor TEXT NOT NULL DEFAULT 'smtp';
ALTER TABLE email_mailboxes DROP CONSTRAINT IF EXISTS email_mailboxes_provedor_check;
ALTER TABLE email_mailboxes ADD CONSTRAINT email_mailboxes_provedor_check CHECK (provedor IN ('smtp', 'microsoft'));

ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS oauth_conta TEXT;          -- UPN que autorizou
ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS oauth_tenant_id TEXT;      -- organização Microsoft (tid)
ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS oauth_refresh_token_encrypted TEXT;
ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS oauth_access_token_encrypted TEXT;
ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS oauth_access_expira_em TIMESTAMPTZ;
