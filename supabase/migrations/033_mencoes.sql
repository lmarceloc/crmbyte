-- Menções (@fulano) em notas: cada menção gera uma notificação no sininho de
-- quem foi mencionado. O trecho e o nome do autor ficam gravados aqui para a
-- notificação não depender de ler a nota (que pode ser de outro usuário).
CREATE TABLE IF NOT EXISTS nota_mencoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  note_id UUID NOT NULL REFERENCES contact_notes(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  mencionado_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  autor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  autor_nome TEXT,
  trecho TEXT NOT NULL,
  vista_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT nota_mencoes_unica UNIQUE (note_id, mencionado_id)
);

CREATE INDEX IF NOT EXISTS nota_mencoes_mencionado_idx ON nota_mencoes (mencionado_id, vista_em, created_at DESC);

ALTER TABLE nota_mencoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nota_mencoes_select ON nota_mencoes;
DROP POLICY IF EXISTS nota_mencoes_insert ON nota_mencoes;
DROP POLICY IF EXISTS nota_mencoes_update ON nota_mencoes;
-- Cada pessoa vê só as menções que recebeu (e as que fez).
CREATE POLICY nota_mencoes_select ON nota_mencoes FOR SELECT
  USING (is_account_member(account_id) AND (mencionado_id = auth.uid() OR autor_id = auth.uid()));
CREATE POLICY nota_mencoes_insert ON nota_mencoes FOR INSERT
  WITH CHECK (
    is_account_member(account_id, 'agent')
    AND autor_id = auth.uid()
    -- só dá para mencionar quem é da mesma conta
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = mencionado_id AND p.account_id = nota_mencoes.account_id)
  );
CREATE POLICY nota_mencoes_update ON nota_mencoes FOR UPDATE
  USING (mencionado_id = auth.uid()) WITH CHECK (mencionado_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'nota_mencoes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE nota_mencoes;
  END IF;
END $$;
