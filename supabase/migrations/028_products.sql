-- ============================================================
-- 028_products — catálogo de produtos e produtos no negócio
--
--   products       catálogo da conta (ex.: "Integração", R$ 7.000)
--   deal_products  itens do negócio; guarda NOME e PREÇO no momento da
--                  inclusão (editar o catálogo depois não altera negócios antigos)
--   deals.value    = soma dos itens quando o negócio tem ao menos 1 produto
--                  (sem itens, o valor continua manual)
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT products_name_check CHECK (btrim(name) <> ''),
  CONSTRAINT products_price_check CHECK (price >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS products_account_name_key ON products (account_id, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS idx_products_account_active ON products (account_id, active);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS products_select ON products;
DROP POLICY IF EXISTS products_insert ON products;
DROP POLICY IF EXISTS products_update ON products;
DROP POLICY IF EXISTS products_delete ON products;
CREATE POLICY products_select ON products FOR SELECT USING (is_account_member(account_id));
CREATE POLICY products_insert ON products FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY products_update ON products FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY products_delete ON products FOR DELETE USING (is_account_member(account_id, 'admin'));
DROP TRIGGER IF EXISTS set_updated_at ON products;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS deal_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT deal_products_qty_check CHECK (quantity > 0),
  CONSTRAINT deal_products_price_check CHECK (unit_price >= 0)
);
CREATE INDEX IF NOT EXISTS idx_deal_products_deal ON deal_products (deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_products_account ON deal_products (account_id);
ALTER TABLE deal_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deal_products_select ON deal_products;
DROP POLICY IF EXISTS deal_products_insert ON deal_products;
DROP POLICY IF EXISTS deal_products_update ON deal_products;
DROP POLICY IF EXISTS deal_products_delete ON deal_products;
CREATE POLICY deal_products_select ON deal_products FOR SELECT USING (is_account_member(account_id));
CREATE POLICY deal_products_insert ON deal_products FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY deal_products_update ON deal_products FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY deal_products_delete ON deal_products FOR DELETE USING (is_account_member(account_id, 'agent'));

-- deals.value acompanha a soma dos itens.
CREATE OR REPLACE FUNCTION fn_deal_products_total() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_deal UUID;
        v_total NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN v_deal := OLD.deal_id; ELSE v_deal := NEW.deal_id; END IF;
  SELECT sum(unit_price * quantity) INTO v_total FROM deal_products WHERE deal_id = v_deal;
  IF v_total IS NOT NULL THEN
    UPDATE deals SET value = v_total WHERE id = v_deal AND value IS DISTINCT FROM v_total;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS deal_products_total ON deal_products;
CREATE TRIGGER deal_products_total AFTER INSERT OR UPDATE OR DELETE ON deal_products
  FOR EACH ROW EXECUTE FUNCTION fn_deal_products_total();
REVOKE EXECUTE ON FUNCTION fn_deal_products_total() FROM PUBLIC, anon, authenticated;
