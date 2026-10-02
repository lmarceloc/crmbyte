-- Motivos de perda cadastráveis por conta. O negócio guarda o texto
-- (deals.lost_reason), então editar/excluir aqui não altera o histórico.
CREATE TABLE IF NOT EXISTS loss_reasons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT loss_reasons_name_check CHECK (btrim(name) <> '')
);
CREATE UNIQUE INDEX IF NOT EXISTS loss_reasons_account_name_key ON loss_reasons (account_id, lower(btrim(name)));
ALTER TABLE loss_reasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS loss_reasons_select ON loss_reasons;
DROP POLICY IF EXISTS loss_reasons_insert ON loss_reasons;
DROP POLICY IF EXISTS loss_reasons_update ON loss_reasons;
DROP POLICY IF EXISTS loss_reasons_delete ON loss_reasons;
CREATE POLICY loss_reasons_select ON loss_reasons FOR SELECT USING (is_account_member(account_id));
CREATE POLICY loss_reasons_insert ON loss_reasons FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY loss_reasons_update ON loss_reasons FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY loss_reasons_delete ON loss_reasons FOR DELETE USING (is_account_member(account_id, 'admin'));

-- Motivos iniciais: contas existentes e contas novas.
CREATE OR REPLACE FUNCTION fn_motivos_padrao(p_account UUID) RETURNS void
LANGUAGE sql SET search_path = public AS $$
  INSERT INTO loss_reasons (account_id, name)
  SELECT p_account, n FROM unnest(ARRAY[
    'Preço','Escolheu um concorrente','Sem orçamento','Sem resposta / sumiu',
    'Sem interesse','Momento errado','Não é o perfil','Outro']) AS n
  ON CONFLICT DO NOTHING;
$$;
REVOKE EXECUTE ON FUNCTION fn_motivos_padrao(UUID) FROM PUBLIC, anon, authenticated;

SELECT fn_motivos_padrao(id) FROM accounts;

CREATE OR REPLACE FUNCTION fn_accounts_motivos() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM fn_motivos_padrao(NEW.id); RETURN NEW; END $$;
REVOKE EXECUTE ON FUNCTION fn_accounts_motivos() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_accounts_motivos ON accounts;
CREATE TRIGGER trg_accounts_motivos AFTER INSERT ON accounts FOR EACH ROW EXECUTE FUNCTION fn_accounts_motivos();
