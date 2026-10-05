# IA: rascunho de e-mail de prospecção

Página **IA** no menu lateral (atendente ou acima). Lê o site da empresa-alvo, cruza com os dados
do lead e com o que a sua empresa oferece, e escreve o rascunho de um e-mail. Nada é enviado: o
resultado aparece editável, com botões de copiar.

## Migration
- `041_ai_skills.sql` — tabelas `ai_skills` (skills) e `ai_company_profile` (quem está prospectando).
- `039` e `040` liberam `openrouter` e `firecrawl` em `integration_keys` (Configurações → Chaves de API).

Rode no SQL Editor do Supabase **antes** de usar a página.

## Configuração (uma vez, por um admin)
1. **Configurações → Chaves de API:** chave do **OpenRouter** (obrigatória) e do **Firecrawl**
   (recomendada: sem ela o e-mail sai só com os dados digitados, e a tela avisa).
2. **Configurações → IA:** *nome da empresa*, *o que a empresa faz* (opcional) e *serviços e produtos
   que oferece* (obrigatório). O modelo só promete o que estiver na lista de serviços. Sem nome e
   serviços, a página trava e a API recusa com `ia_profile_missing`.

## Na página
- **Formulário:** nome do lead, empresa e site (obrigatórios); cargo e LinkedIn do lead (opcionais).
  O LinkedIn entra só como link de contexto: a página do perfil **não** é lida.
- **Skills:** nome + descrição + regras ou conhecimento. Podem ser regras que o modelo segue (tom de
  voz, estrutura do e-mail) ou só material de apoio, como o resumo de um livro sobre escrever bem
  (aceita colar o texto ou subir `.md`/`.txt`, até 20.000 caracteres por skill; até 24.000 somadas
  numa geração). As skills escolhidas vão no pedido ao modelo como guia de estilo e regras.
- **Aviso na tela:** "É possível gerar até 10 e-mails automáticos por dia." É só um aviso — o app
  **não** conta nem bloqueia. O limite real é o do OpenRouter (modelos gratuitos: ~20 pedidos por
  minuto e um teto diário); ao estourar, a tela mostra uma mensagem clara (HTTP 429).

## Como funciona (`src/lib/ia/`)
Fluxo fixo no servidor, não um agente com ferramentas (com modelo gratuito é bem mais confiável):

1. `firecrawl.ts` — `POST https://api.firecrawl.dev/v2/scrape` (Markdown, só o conteúdo principal) na
   **página informada**. Falha aqui não impede o e-mail: segue com os dados digitados e avisa o motivo.
2. `prompt.ts` — monta o pedido: regras de escrita, quem está prospectando, skills, dados do lead e o
   texto do site (cortado em 8.000 caracteres e tratado como dado não confiável, não como instrução).
3. `openrouter.ts` — chama `openrouter/free`. Erros de chave, crédito, limite e tempo viram mensagens
   em português.
4. `gerar-email.ts` — separa `ASSUNTO:` do corpo (tolera negrito, cercas de código e `<think>`).

Rota: `POST /api/ia/email` (`agent`+). Skills e perfil são lidos com a RLS do usuário.

## Limites conhecidos
- Lê **uma** página do site (a informada), não o site inteiro; não consulta CNPJ, reputação nem notícias.
- A qualidade do `openrouter/free` varia: ele escolhe entre os modelos gratuitos disponíveis.
- A integração com o Firecrawl foi escrita contra o contrato do `/v2/scrape` e testada com respostas
  simuladas; confirme com uma chave real no primeiro uso.
