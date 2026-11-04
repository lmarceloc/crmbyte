# MCP do CRM — a IA do cliente consulta e cria coisas na conta

Servidor [MCP](https://modelcontextprotocol.io) remoto em `POST /api/mcp`. O cliente gera uma
chave em **Configurações → Acesso à API do CRM**, cadastra o endereço e a chave no assistente
dele (Claude Code, Cursor, n8n…) e a IA passa a ter as ferramentas abaixo, sempre dentro da
conta dona da chave.

## Migration
- `057_api_keys_acesso.sql` — `api_keys.acesso` (`entrada` | `leitura` | `escrita`). **Rode antes de
  subir o código**: a tela de chaves passa a ler essa coluna. As chaves que já existem ficam como
  `entrada`: continuam só mandando contatos, e **não** ganham acesso ao MCP.

## Níveis de acesso da chave
| Nível | O que a chave faz |
|---|---|
| `entrada` | Só `POST /api/integracoes/contatos` (n8n, Apollo). Não entra no MCP. |
| `leitura` | MCP: só as ferramentas de consulta. Não vê nem chama as de escrita, nem manda contatos. |
| `escrita` | MCP completo. Também pode mandar contatos pela API. |

## Ferramentas
| Ferramenta | Acesso | O que faz |
|---|---|---|
| `buscar_contatos` | leitura | Por trecho de nome, e-mail, empresa ou telefone (até 50) |
| `listar_pipelines` | leitura | Funis com etapas em ordem e a moeda padrão da conta |
| `listar_cadencias` | leitura | Cadências (id, nome, status); só `ativa` aceita inscrição |
| `criar_contato` | escrita | Cria contato e empresa; **não duplica** (e-mail → telefone → LinkedIn) e só completa campos vazios |
| `criar_negocio` | escrita | Negócio em aberto num funil, ligado a um contato; sem etapa, entra na primeira |
| `mover_negocio` | escrita | Troca a etapa de um negócio em aberto, dentro do mesmo funil. Etapa de ganho **não** muda o status (igual ao quadro) |
| `criar_tarefa` | escrita | Tarefa com prazo, ligada a contato e/ou negócio; sem responsável, fica com o dono da chave |
| `adicionar_nota` | escrita | Nota no histórico do contato (@menções não são processadas) |
| `inscrever_em_cadencia` | escrita | Inscreve os contatos de um negócio, ou contatos soltos, numa cadência ativa. **Passa a enviar e-mails reais.** |

Não há ferramenta que apague dados nem que envie WhatsApp ou e-mail avulso.

## Como conectar
```bash
claude mcp add --transport http crm https://SEU-DOMINIO/api/mcp \
  --header "Authorization: Bearer wacrm_…"
```
Clientes com arquivo de configuração: `{ "mcpServers": { "crm": { "url": "https://SEU-DOMINIO/api/mcp", "headers": { "Authorization": "Bearer wacrm_…" } } } }`.
Também vale `X-Api-Key: wacrm_…`.

## Como funciona
- Transporte HTTP sem estado (JSON-RPC por POST, resposta em JSON): sem sessão, sem SSE, sem
  dependência nova — cabe no Worker da Cloudflare. `GET` e `DELETE` respondem `405`.
- Implementado em `src/lib/mcp/` (protocolo, ferramentas) e `src/app/api/mcp/route.ts`.
- O acesso usa o cliente de serviço (ignora a RLS). **O isolamento entre contas é feito no
  código**: toda consulta das ferramentas filtra por `account_id` da chave, e há teste que
  falha se uma ferramenta nova consultar uma tabela sem esse filtro (`src/lib/mcp/ferramentas.test.ts`).
- Erros esperados (contato inexistente, cadência pausada…) voltam à IA como resultado com
  `isError`, para ela se corrigir; erros inesperados mostram só uma mensagem genérica (o
  detalhe fica no log do servidor).
- Gravações pelo MCP não disparam automações do WhatsApp: os gatilhos existentes nascem de
  mensagens recebidas no webhook. Negócios criados levam `source = "mcp"` (aparece em "Origem").

## Limites conhecidos
- **Só chave de API no cabeçalho.** Não há OAuth, então conectores que exigem OAuth (por
  exemplo o cadastro de conectores personalizados pela interface web de alguns assistentes)
  não conectam; clientes que aceitam servidor HTTP com cabeçalho de autorização, sim.
- Sem limite de requisições por chave e sem registro do que cada chave fez (só `last_used_at`,
  gravado no máximo uma vez por minuto).
- Quem tem uma chave de `escrita` age como o admin que a gerou. Trate-a como senha.
