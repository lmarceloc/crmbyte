-- 057_api_keys_acesso — nível de acesso de cada chave de API do CRM.
--
--   entrada  só manda contatos (POST /api/integracoes/contatos): o que toda chave já fazia
--   leitura  MCP (/api/mcp): consulta contatos, funis e cadências; não grava nada
--   escrita  MCP: lê e também cria contatos, negócios, tarefas, notas e inscreve em cadências
--
-- As chaves que já existem ficam como `entrada`: nada muda no que elas alcançam, e uma chave
-- entregue ao n8n não ganha acesso de leitura ao CRM por causa do MCP. Quem quiser conectar
-- uma IA gera uma chave nova com `leitura` ou `escrita`.
--
-- Idempotente. Rode antes de subir o código.
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS acesso TEXT NOT NULL DEFAULT 'entrada';
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_acesso_check;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_acesso_check CHECK (acesso IN ('entrada', 'leitura', 'escrita'));
