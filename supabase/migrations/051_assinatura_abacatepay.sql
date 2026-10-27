-- 051_assinatura_abacatepay — assinatura do CRM (R$ 29/mês por conta) cobrada pela AbacatePay.
--   * conta_assinatura: uma linha por conta com o estado da assinatura. Membros leem
--     (a tela Configurações → Plano); só o servidor (service role) grava, a partir do
--     checkout criado pela API e dos webhooks da AbacatePay.
--   * abacatepay_webhook_eventos: entregas já processadas (a AbacatePay repete a entrega
--     com o mesmo id quando não recebe 2xx).

CREATE TABLE IF NOT EXISTS conta_assinatura (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'sem_assinatura',
  abacate_customer_id TEXT,
  abacate_checkout_id TEXT,
  abacate_checkout_url TEXT,
  abacate_subscription_id TEXT,
  metodo TEXT,
  valor_centavos INTEGER,
  ativa_desde TIMESTAMPTZ,
  ultimo_pagamento_em TIMESTAMPTZ,
  cancelada_em TIMESTAMPTZ,
  ultimo_evento TEXT,
  dev_mode BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT conta_assinatura_status_check
    CHECK (status IN ('sem_assinatura', 'pendente', 'ativa', 'pagamento_falhou', 'cancelada'))
);

ALTER TABLE conta_assinatura ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conta_assinatura_select ON conta_assinatura;
CREATE POLICY conta_assinatura_select ON conta_assinatura FOR SELECT USING (is_account_member(account_id));

DROP TRIGGER IF EXISTS set_updated_at ON conta_assinatura;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON conta_assinatura
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS abacatepay_webhook_eventos (
  id TEXT PRIMARY KEY,
  evento TEXT NOT NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  recebido_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Só o service role lê e grava.
ALTER TABLE abacatepay_webhook_eventos ENABLE ROW LEVEL SECURITY;
