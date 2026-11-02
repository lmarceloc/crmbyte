-- ============================================================
-- 056_contact_nome_sobrenome — nome e sobrenome em campos separados
--
-- `contacts.name` continua sendo o nome COMPLETO: é ele que o resto do CRM
-- lê (listas, WhatsApp, disparos, busca). As colunas novas `first_name` e
-- `last_name` guardam a separação quando ela é conhecida (formulário,
-- importação por API/CSV, prospecção). Servem às variáveis {{nome}} e
-- {{sobrenome}} das cadências de e-mail. Contato sem separação (os que já
-- existem, os do WhatsApp) continua valendo: as cadências dividem o `name`.
--
-- O gatilho abaixo mantém as três colunas coerentes, venha a escrita de onde
-- vier:
--   * mexeu em first_name/last_name  → `name` é recomposto ("Nome Sobrenome");
--   * mexeu só em `name`             → a separação antiga deixa de valer e é
--                                      apagada (senão ela contradiria o nome).
--
-- Idempotente. Não altera contatos existentes.
-- ============================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_name  TEXT;

CREATE OR REPLACE FUNCTION public.contacts_sync_nome()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.first_name := NULLIF(btrim(NEW.first_name), '');
  NEW.last_name  := NULLIF(btrim(NEW.last_name), '');

  IF TG_OP = 'UPDATE'
     AND NEW.name       IS DISTINCT FROM OLD.name
     AND NEW.first_name IS NOT DISTINCT FROM OLD.first_name
     AND NEW.last_name  IS NOT DISTINCT FROM OLD.last_name THEN
    NEW.first_name := NULL;
    NEW.last_name  := NULL;
  ELSIF NEW.first_name IS NOT NULL OR NEW.last_name IS NOT NULL THEN
    NEW.name := NULLIF(btrim(concat_ws(' ', NEW.first_name, NEW.last_name)), '');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contacts_sync_nome ON contacts;
CREATE TRIGGER trg_contacts_sync_nome
  BEFORE INSERT OR UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION public.contacts_sync_nome();
