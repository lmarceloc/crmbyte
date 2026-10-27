-- 052_assinatura_teste_gratis — 7 dias grátis e bloqueio de contas sem assinatura.
--   * conta_assinatura.teste_ate: fim do teste grátis. Conta nova: criação + 7 dias
--     (trigger abaixo). Contas que já existiam: 7 dias a partir desta migration.
--   * conta_assinatura.isenta: conta liberada sem assinatura (ex.: a própria Byte).
--     Só muda pelo SQL Editor: a tabela não tem policy de escrita para usuários.
--   Fica aqui, e não em `accounts`, porque o dono pode editar a própria linha de `accounts`.

ALTER TABLE conta_assinatura ADD COLUMN IF NOT EXISTS teste_ate TIMESTAMPTZ;
ALTER TABLE conta_assinatura ADD COLUMN IF NOT EXISTS isenta BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO conta_assinatura (account_id, teste_ate)
SELECT id, NOW() + INTERVAL '7 days' FROM accounts
ON CONFLICT (account_id) DO UPDATE
  SET teste_ate = COALESCE(conta_assinatura.teste_ate, EXCLUDED.teste_ate);

CREATE OR REPLACE FUNCTION fn_conta_assinatura_teste() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO conta_assinatura (account_id, teste_ate)
  VALUES (NEW.id, NEW.created_at + INTERVAL '7 days')
  ON CONFLICT (account_id) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_conta_assinatura_teste ON accounts;
CREATE TRIGGER trg_conta_assinatura_teste AFTER INSERT ON accounts
  FOR EACH ROW EXECUTE FUNCTION fn_conta_assinatura_teste();

-- Para liberar uma conta sem assinatura (rode no SQL Editor, com o id da conta):
--   UPDATE conta_assinatura SET isenta = TRUE WHERE account_id = '<id da conta>';
