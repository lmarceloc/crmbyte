-- ============================================================
-- 027_companies_deal_contacts — EMPRESA > NEGÓCIO > CONTATOS
--
--   companies      nome, site, LinkedIn
--   deals          + company_id, linkedin_url, temperature
--   deal_contacts  contatos dentro do negócio (um é o principal)
--   contacts       + company_id (o campo texto `company` continua por compat.)
--   cadência       inscrição passa a ser por (cadência, negócio, CONTATO)
-- ============================================================

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  website TEXT,
  linkedin_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT companies_name_check CHECK (btrim(name) <> '')
);
CREATE UNIQUE INDEX IF NOT EXISTS companies_account_name_key ON companies (account_id, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS idx_companies_account ON companies (account_id);
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS companies_select ON companies;
DROP POLICY IF EXISTS companies_insert ON companies;
DROP POLICY IF EXISTS companies_update ON companies;
DROP POLICY IF EXISTS companies_delete ON companies;
CREATE POLICY companies_select ON companies FOR SELECT USING (is_account_member(account_id));
CREATE POLICY companies_insert ON companies FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY companies_update ON companies FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY companies_delete ON companies FOR DELETE USING (is_account_member(account_id, 'agent'));
DROP TRIGGER IF EXISTS set_updated_at ON companies;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS temperature TEXT NOT NULL DEFAULT 'frio';
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_temperature_check;
ALTER TABLE deals ADD CONSTRAINT deals_temperature_check
  CHECK (temperature IN ('sem_interesse','frio','morno','quente','quase_fechando'));
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts (company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_company ON deals (company_id) WHERE company_id IS NOT NULL;

-- ------------------------------------------------------------
-- Contatos dentro do negócio
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deal_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (deal_id, contact_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS deal_contacts_one_primary ON deal_contacts (deal_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS idx_deal_contacts_contact ON deal_contacts (contact_id);
CREATE INDEX IF NOT EXISTS idx_deal_contacts_account ON deal_contacts (account_id);
ALTER TABLE deal_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deal_contacts_select ON deal_contacts;
DROP POLICY IF EXISTS deal_contacts_insert ON deal_contacts;
DROP POLICY IF EXISTS deal_contacts_update ON deal_contacts;
DROP POLICY IF EXISTS deal_contacts_delete ON deal_contacts;
CREATE POLICY deal_contacts_select ON deal_contacts FOR SELECT USING (is_account_member(account_id));
CREATE POLICY deal_contacts_insert ON deal_contacts FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY deal_contacts_update ON deal_contacts FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY deal_contacts_delete ON deal_contacts FOR DELETE USING (is_account_member(account_id, 'agent'));

-- Backfill: cada negócio com contato vira 1 linha principal.
INSERT INTO deal_contacts (account_id, deal_id, contact_id, is_primary)
SELECT account_id, id, contact_id, TRUE FROM deals WHERE contact_id IS NOT NULL
ON CONFLICT (deal_id, contact_id) DO NOTHING;

-- Backfill: empresas a partir do texto contacts.company.
INSERT INTO companies (account_id, name)
SELECT DISTINCT ON (account_id, lower(btrim(company))) account_id, btrim(company)
FROM contacts WHERE company IS NOT NULL AND btrim(company) <> ''
ON CONFLICT DO NOTHING;
UPDATE contacts c SET company_id = co.id
FROM companies co
WHERE c.company_id IS NULL AND c.company IS NOT NULL AND btrim(c.company) <> ''
  AND co.account_id = c.account_id AND lower(btrim(co.name)) = lower(btrim(c.company));
UPDATE deals d SET company_id = c.company_id
FROM contacts c WHERE d.company_id IS NULL AND d.contact_id = c.id AND c.company_id IS NOT NULL;

-- Mantém deals.contact_id = contato principal (telas antigas continuam valendo).
CREATE OR REPLACE FUNCTION fn_deal_contacts_sync() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_deal UUID;
        v_target UUID;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN v_deal := OLD.deal_id; ELSE v_deal := NEW.deal_id; END IF;
  SELECT contact_id INTO v_target FROM deal_contacts
   WHERE deal_id = v_deal ORDER BY is_primary DESC, created_at LIMIT 1;
  UPDATE deals SET contact_id = v_target WHERE id = v_deal AND contact_id IS DISTINCT FROM v_target;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS deal_contacts_sync ON deal_contacts;
CREATE TRIGGER deal_contacts_sync AFTER INSERT OR UPDATE OR DELETE ON deal_contacts
  FOR EACH ROW EXECUTE FUNCTION fn_deal_contacts_sync();

-- Telas antigas escrevem deals.contact_id: reflete em deal_contacts (vira o principal).
CREATE OR REPLACE FUNCTION fn_deals_contact_to_deal_contacts() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.contact_id IS NULL THEN RETURN NEW; END IF;
  UPDATE deal_contacts SET is_primary = FALSE
   WHERE deal_id = NEW.id AND contact_id <> NEW.contact_id AND is_primary;
  INSERT INTO deal_contacts (account_id, deal_id, contact_id, is_primary)
  VALUES (NEW.account_id, NEW.id, NEW.contact_id, TRUE)
  ON CONFLICT (deal_id, contact_id) DO UPDATE SET is_primary = TRUE;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS deals_contact_to_deal_contacts ON deals;
CREATE TRIGGER deals_contact_to_deal_contacts AFTER INSERT OR UPDATE OF contact_id ON deals
  FOR EACH ROW EXECUTE FUNCTION fn_deals_contact_to_deal_contacts();

REVOKE EXECUTE ON FUNCTION fn_deal_contacts_sync() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_deals_contact_to_deal_contacts() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- Cadência: uma inscrição por (cadência, negócio, contato)
-- ------------------------------------------------------------
ALTER TABLE email_cadence_enrollments DROP CONSTRAINT IF EXISTS email_cadence_enrollments_unica;
ALTER TABLE email_cadence_enrollments
  ADD CONSTRAINT email_cadence_enrollments_unica UNIQUE (cadence_id, deal_id, contact_id);
