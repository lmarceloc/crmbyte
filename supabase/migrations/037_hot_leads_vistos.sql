-- Notificação de leads quentes: até quando cada usuário já viu a lista.
-- Lead quente com abertura depois disso conta como "novo" no selo do
-- menu lateral. Coluna do próprio perfil (editável pelo dono da linha
-- via profiles_update; não é coluna de filiação, então a 036 não barra).
--
-- Idempotente.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hot_leads_vistos_em TIMESTAMPTZ;
