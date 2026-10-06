# Analisar Deals: prioridades do funil

Botão **Analisar Deals** no cabeçalho do funil (atendente ou acima). Lê os negócios **em aberto**,
dá a cada um uma nota de atenção de **0 a 100** e abre o painel lateral **Prioridades de hoje** com
o motivo e a ação sugerida. Nada é alterado nos negócios: é só leitura.

## Migration
- `045_analisar_deals.sql` — tabelas `analisar_deals_config` (pesos e limites da conta) e
  `analisar_deals_cache` (respostas da IA; só o servidor acessa) e libera o provedor `analisar_deals`
  em `integration_keys`.

Rode no SQL Editor do Supabase **antes** de usar a tela de configuração e a IA. Os critérios por
regra funcionam mesmo sem a migration (valem os pesos padrão).

## Uso
1. **Analisar Deals** abre o modal. Escolha o que importa (vários ao mesmo tempo), as etapas e, se
   quiser, **só os meus negócios**. "Equilibrado" já vem marcado.
2. **Analisar** abre o painel. O resultado das regras aparece na hora; se algum critério usa IA, a
   lista se refina a cada bloco de 20 negócios ("IA analisando 40 de 100…").
3. Clique num item para abrir o negócio; o cartão correspondente é destacado no quadro.
4. O botão de atualizar refaz a análise (o que a IA já respondeu vem do cache, sem custo).

Cada análise cobre no máximo **100 negócios**. Com mais que isso, entram os 100 que mais pedem
atenção pelos critérios de regra escolhidos e o painel diz quantos ficaram de fora (use etapa ou "só
os meus" para olhar o resto).

## Critérios
**Por regra** (instantâneos, sem custo): mais tempo sem contato, menos atualizações, parado na etapa,
maior valor, menor valor (os dois últimos se excluem), aberturas de e-mail (limite de lead quente da
cadência), resposta sem ação, fechamento próximo, sem próxima tarefa e temperatura do negócio.

**Com IA** (selo "IA"): intenção de compra, urgência do cliente e risco de perda. A IA lê as notas,
as observações do negócio e as últimas mensagens do cliente (WhatsApp) e responde numa escala de
situações descritas em palavras (`src/lib/pipeline/perguntas.ts`). Também sugere a próxima ação.

### Como a nota é calculada (`src/lib/pipeline/prioridade.ts`)
1. Cada critério vira uma intensidade de 0 a 1; a **nota base** é a **média ponderada** dos critérios
   escolhidos, com os pesos de Configurações → IA. Um critério de IA com confiança abaixo do mínimo
   (padrão 0,3) é ignorado e o item mostra "IA incerta"; negócio que a IA não avaliou fica só com as
   regras.
2. **Reforço (sempre aplicado, mesmo sem marcar):** a **temperatura** e a **previsão de fechamento**
   multiplicam a nota base. Com a força no padrão (5): quase fechando ×1,8, quente ×1,6, morno ×1,2,
   frio ×1 (sem efeito) e sem interesse ×0,5; fechamento previsto para hoje ou vencido soma +0,8 ao
   multiplicador, e o efeito cai até zero quando a data está além da janela (7 dias). Por ser
   multiplicação, o reforço age sobre a nota e não a substitui: um lead quente **parado** sobe na lista,
   e um quente já bem atendido continua baixo. O teto da nota é 100.

Faixas: **> 80** crítica, **60–80** alta, **40–60** média, **< 40** baixa.

Como a nota base é uma média, **escolher muitos critérios achata as notas** (sem o reforço, um negócio
só chegaria a 80+ se quase tudo apontasse atenção). Para ver o que é urgente em uma dimensão, escolha
poucos critérios. O "Equilibrado" não marca temperatura nem fechamento porque eles já reforçam toda análise.

## Configuração (por um admin)
- **Configurações → Chaves de API → Analisar Deals:** chave do serviço de IA. Fica cifrada e nunca
  volta ao navegador.
- **Configurações → IA → Analisar Deals:** peso de cada critério (0 ignora), a força dos reforços da
  temperatura e do fechamento (5 padrão, 0 desliga, 10 dobra), limites em dias (sem contato, sem
  atualização, parado na etapa, janela do fechamento) e a confiança mínima da IA. Configuração salva
  antes dos reforços continua valendo (os reforços entram com o padrão).

## IA: dois modos
- **Com a chave do Analisar Deals:** serviço de decisão do TypeSafe
  (`POST https://api.typesafe.ai/v1/systemone`; o modelo é a constante `MODELO_DO_SERVICO`). Uma chamada por negócio, 6 em
  paralelo, com nova tentativa em limite de uso (429) e falha do servidor. Perguntas tipadas: três
  *Score* (uma dimensão cada) e uma *Choice* (próxima ação). A resposta traz a confiança.
- **Sem a chave, mas com a do OpenRouter:** **modo reduzido**. O `openrouter/free` responde as mesmas
  perguntas em JSON, em **uma** chamada, só para os **10 primeiros** (pelas regras). Não há confiança
  real: o resultado vem marcado "estimado".
- **Sem nenhuma das duas:** só regras; os botões de IA ficam desativados com um aviso.

Se a IA falhar (chave recusada, limite de uso, rede), o painel avisa e mantém a ordem pelas regras;
nunca troca de serviço em silêncio.

## Privacidade
Para os critérios com IA, o servidor monta o texto e o envia ao serviço externo: título, empresa,
etapa, valor, dias parado, previsão de fechamento, observações do negócio (até 600 caracteres), até 5
notas (1.000 caracteres no total) e até 3 mensagens do cliente (300 caracteres cada). **E-mail e
telefone são trocados por `[e-mail]` e `[telefone]`**; nomes de contatos não vão. O navegador não
escolhe o que sai: só envia os ids dos negócios. Negócio sem nenhum texto para ler não é enviado.

Respostas da IA ficam em cache por 24 horas e só são refeitas quando o negócio muda (o cache é
por negócio e pergunta, então trocar os critérios só pergunta o que falta).

## API
- `GET /api/pipelines/[id]/prioridades?criterios=a,b&etapas=id,id&responsavel=uuid` — sinais dos
  negócios (até 100), a configuração da conta e que IA está disponível.
- `POST /api/pipelines/[id]/julgar` — `{ deal_ids (até 20), criterios (de IA), proxima_acao }`.
  Devolve `resultados`, `sem_dados`, `falhas`, `pendentes`, `limite_de_uso` e `do_cache`.
- `GET|PUT /api/analisar-deals/config` — pesos e limites (PUT só admin).
