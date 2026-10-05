-- Página IA.
--
--  ai_skills          nome + descrição + regras/conhecimento (`content`): pode ser uma
--                     regra de escrita, o tom de voz, a oferta ou só material de apoio
--                     (ex.: resumo de um livro sobre escrever bem). A equipe escolhe
--                     quais valem a cada geração. Mesma RLS de `companies`: membros
--                     leem; agent+ cria, edita e apaga.
--  ai_company_profile quem está prospectando: nome da empresa, o que ela faz e os
--                     serviços/produtos que oferece (Configurações → IA). Uma linha por
--                     conta; membros leem, só admin+ grava.
--
-- Idempotente.
CREATE TABLE IF NOT EXISTS ai_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_skills_name_check CHECK (btrim(name) <> '' AND length(name) <= 100),
  CONSTRAINT ai_skills_description_check CHECK (length(description) <= 500),
  CONSTRAINT ai_skills_content_check CHECK (btrim(content) <> '' AND length(content) <= 20000)
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_skills_account_name_key ON ai_skills (account_id, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS idx_ai_skills_account ON ai_skills (account_id);

ALTER TABLE ai_skills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_skills_select ON ai_skills;
DROP POLICY IF EXISTS ai_skills_insert ON ai_skills;
DROP POLICY IF EXISTS ai_skills_update ON ai_skills;
DROP POLICY IF EXISTS ai_skills_delete ON ai_skills;
CREATE POLICY ai_skills_select ON ai_skills FOR SELECT USING (is_account_member(account_id));
CREATE POLICY ai_skills_insert ON ai_skills FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY ai_skills_update ON ai_skills FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY ai_skills_delete ON ai_skills FOR DELETE USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON ai_skills;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON ai_skills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- Quem está prospectando (alimenta o pedido ao modelo)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_company_profile (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL DEFAULT '',
  what_we_do TEXT NOT NULL DEFAULT '',
  services TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_company_profile_name_check CHECK (length(company_name) <= 120),
  CONSTRAINT ai_company_profile_what_check CHECK (length(what_we_do) <= 2000),
  CONSTRAINT ai_company_profile_services_check CHECK (length(services) <= 4000)
);

ALTER TABLE ai_company_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_company_profile_select ON ai_company_profile;
DROP POLICY IF EXISTS ai_company_profile_insert ON ai_company_profile;
DROP POLICY IF EXISTS ai_company_profile_update ON ai_company_profile;
CREATE POLICY ai_company_profile_select ON ai_company_profile FOR SELECT USING (is_account_member(account_id));
CREATE POLICY ai_company_profile_insert ON ai_company_profile FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY ai_company_profile_update ON ai_company_profile FOR UPDATE USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON ai_company_profile;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON ai_company_profile
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
