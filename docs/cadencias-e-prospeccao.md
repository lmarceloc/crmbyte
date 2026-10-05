# Cadências de e-mail, leads quentes e prospecção

Implementado a partir das specs `spec-cadencias-fluxo-email` e
`especificacao-hot-leads-e-prospeccao`, adaptadas ao wacrm
(`organization` → `account`, `crm_leads` → `deals`).

## Migrations
- `024_email_cadences.sql` — cadências, inscrições, eventos, caixas de envio, colunas novas em `contacts`, função de abertura atômica.
- `025_prospecting.sql` — campanhas/candidatos/credencial/lock de prospecção, `deals.source/external_id`.
- `038_mailbox_imap_sent_copy.sql` — colunas de IMAP em `email_mailboxes` (cópia em "Enviados"). **Rode antes de subir o código que a usa**: a tela e a listagem de caixas passam a ler essas colunas.
- `042_cadence_reply_bounce_tracking.sql` — leitura da caixa de entrada: estado do IMAP em `email_mailboxes`, `respondeu_em`/`bounce_em` na inscrição, `contacts.email_bounced_at`, eventos `respondido`/`bounce`. **Rode antes de subir o código**: o worker e a tela de caixas leem essas colunas.

Rode no SQL Editor do Supabase, em ordem (024 → 025 → … → 042).

## Cron (1×/min, com `Authorization: Bearer $CRON_SECRET`)
- `GET /api/cadencias/worker` — envia e-mails, espera, ramifica, para.
- `GET /api/prospecting/worker` — acompanha buscas Apify e revela e-mails B2B.

Exemplo de crontab: `* * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://SEU_DOMINIO/api/cadencias/worker`

## Cópia em "Enviados" (IMAP)
O SMTP só entrega o e-mail; guardar a cópia na caixa do remetente é trabalho do cliente
de e-mail, e vários provedores (ex.: Umbler) não fazem isso sozinhos. Em **Caixas de envio**,
preencher o *Servidor IMAP* (ex.: `imap.umbler.com`, porta 993, TLS) faz o worker gravar cada
e-mail enviado na pasta de enviados da caixa, marcado como lido.

- Mesmo usuário e senha do SMTP (sem usuário, vale o e-mail da caixa). Só TLS ou STARTTLS.
- A pasta é detectada (`\Sent`, ou nomes como `Sent`/`Enviados`); se o provedor usar outro nome, informe-o no campo *Pasta de enviados*.
- Ao salvar a caixa, o sistema testa login e pasta, como já faz com o SMTP.
- **Gmail e Outlook já guardam a cópia sozinhos**: neles, desmarque *Guardar cópia dos e-mails enviados* (os atalhos desses provedores já vêm assim) — o IMAP continua lendo respostas e bounces.
- A cópia é gravada **depois** de o e-mail sair e de o estado da inscrição ser salvo. Falha de IMAP nunca derruba nem repete um envio: o erro aparece em *Cópia em Enviados falhou* na lista de caixas e a próxima tentativa acontece no minuto seguinte (uma por caixa por minuto, para um IMAP fora do ar não atrasar o lote).
- O evento `email_enviado` agora guarda também o `message_id` (cabeçalho `Message-ID`), útil para achar a mensagem no log do provedor.

## Resposta e bounce (caixa de entrada por IMAP)
Toda caixa com IMAP também tem a **caixa de entrada lida** pelo worker (a cada 3 minutos por
caixa, no começo do tick, antes dos envios). A leitura é só leitura: não marca nada como lido.

- **Resposta do lead**: casada pelo `In-Reply-To`/`References` com o `message_id` gravado no
  `email_enviado`; sem isso, pelo remetente, entre os contatos que receberam e-mail **desta**
  caixa. Grava `respondeu_em` e o evento `respondido`; se a cadência para em resposta
  (Configurações), a inscrição para com motivo `respondeu`. O ramo *Respondeu?* passa a dar Sim.
- **Bounce**: devolução do mailer-daemon/postmaster (relatório DSN, `X-Failed-Recipients`).
  Só a permanente conta (status 5.x.x / `Action: failed`); aviso de atraso é ignorado. Grava
  `bounce_em`, o evento `bounce`, marca `contacts.email_bounced_at` (o worker não envia mais para
  esse endereço) e, se a cadência para em bounce, para a inscrição com motivo `bounce`. Trocar o
  e-mail do contato limpa a marca.
- **Resposta automática** ("estou de férias", `Auto-Submitted`) não conta como resposta.
- Na primeira leitura olha só os últimos 14 dias; depois segue pelo UID (`imap_inbox_last_uid`).
  Até 100 mensagens por leitura; o resto fica para a próxima.
- Erro de leitura aparece em *Leitura da entrada falhou* na lista de caixas.
- Sem IMAP na caixa (ou envio pelo SMTP da instalação), resposta e bounce não são detectados.
- O ramo *Clicou?* passa a usar os cliques já registrados pelo redirecionador.

## Decisões de adaptação
| Spec | wacrm |
|---|---|
| Redis p/ teto diário | contagem de eventos `email_enviado` nas últimas 24 h (por caixa, por cadência, e por instalação) |
| Resend + `platform_smtp_settings` | só SMTP (caixas por vendedor ou `SMTP_*` do `.env`) |
| `crm_tasks` (passo "tarefa") | vira nota no contato (`contact_notes`) |
| Cifra `fn_encrypt_oauth` | `lib/whatsapp/encryption.ts` (AES-256-GCM, `ENCRYPTION_KEY`) |
| Lock advisory de sessão | lease em `prospecting_locks` (RPC) |
| Papéis manager/agent | admin (gerir cadência/caixas/prospecção) / agent (inscrever, ver) — `owner` ≥ `admin` |

## Lacunas da spec (seção 14) já corrigidas de saída
Janela de envio + fuso aplicados pelo worker · dedupe de abertura (60 s) · tokens separados
por finalidade · descadastro por POST (GET só confirma) + `List-Unsubscribe` one-click ·
supressão no contato (`email_unsubscribed_at`) · sem fallback `dev-fallback` do segredo ·
variáveis renderizadas também no título da tarefa e no `Re:` · `updated_at` com trigger ·
servidor valida ≥1 e-mail/≥1 dia ao ativar.

## Ainda não implementado (como na spec)
Envio de WhatsApp pela cadência (o passo para a inscrição com `falha`), inscrição
automática por tag, threading real (`In-Reply-To`) nos e-mails "na mesma conversa".
A contagem de aberturas é acumulada por inscrição (não por e-mail).
