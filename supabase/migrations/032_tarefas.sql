-- Tarefas: retornar ligação, ligar, e-mail etc. Vinculadas a um contato e/ou
-- negócio (histórico em linha do tempo) e criáveis pelo passo "tarefa" da
-- cadência. A notificação do sininho é derivada desta tabela (vista_em nulo =
-- ainda não vista pelo responsável).
CREATE TABLE IF NOT EXISTS tarefas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descricao TEXT,
  tipo TEXT NOT NULL DEFAULT 'outra',
  status TEXT NOT NULL DEFAULT 'pendente',
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  enrollment_id UUID REFERENCES email_cadence_enrollments(id) ON DELETE SET NULL,
  passo_id TEXT,
  origem TEXT NOT NULL DEFAULT 'manual',
  responsavel_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  criada_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  prazo_em TIMESTAMPTZ,
  concluida_em TIMESTAMPTZ,
  concluida_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  vista_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tarefas_titulo_check CHECK (btrim(titulo) <> ''),
  CONSTRAINT tarefas_tipo_check CHECK (tipo IN ('retornar_ligacao','ligacao','email','whatsapp','reuniao','outra')),
  CONSTRAINT tarefas_status_check CHECK (status IN ('pendente','concluida')),
  CONSTRAINT tarefas_origem_check CHECK (origem IN ('manual','cadencia'))
);

CREATE INDEX IF NOT EXISTS tarefas_conta_status_prazo_idx ON tarefas (account_id, status, prazo_em);
CREATE INDEX IF NOT EXISTS tarefas_responsavel_idx ON tarefas (responsavel_id, status);
-- Uma tarefa por (inscrição, passo): uma nova tentativa do worker não duplica.
-- NULLs são distintos, então tarefas manuais não são afetadas.
CREATE UNIQUE INDEX IF NOT EXISTS tarefas_passo_da_inscricao_key ON tarefas (enrollment_id, passo_id);
CREATE INDEX IF NOT EXISTS tarefas_contato_idx ON tarefas (contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tarefas_negocio_idx ON tarefas (deal_id) WHERE deal_id IS NOT NULL;

ALTER TABLE tarefas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tarefas_select ON tarefas;
DROP POLICY IF EXISTS tarefas_insert ON tarefas;
DROP POLICY IF EXISTS tarefas_update ON tarefas;
DROP POLICY IF EXISTS tarefas_delete ON tarefas;
CREATE POLICY tarefas_select ON tarefas FOR SELECT USING (is_account_member(account_id));
CREATE POLICY tarefas_insert ON tarefas FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY tarefas_update ON tarefas FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY tarefas_delete ON tarefas FOR DELETE USING (is_account_member(account_id, 'admin'));

CREATE OR REPLACE FUNCTION fn_tarefas_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_tarefas_updated_at ON tarefas;
CREATE TRIGGER trg_tarefas_updated_at BEFORE UPDATE ON tarefas
  FOR EACH ROW EXECUTE FUNCTION fn_tarefas_updated_at();

-- Realtime: o sininho atualiza sem recarregar a página.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'tarefas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tarefas;
  END IF;
END $$;
