# Cadências de e-mail, leads quentes e prospecção

Implementado a partir das specs `spec-cadencias-fluxo-email` e
`especificacao-hot-leads-e-prospeccao`, adaptadas ao wacrm
(`organization` → `account`, `crm_leads` → `deals`).

## Migrations
- `024_email_cadences.sql` — cadências, inscrições, eventos, caixas de envio, colunas novas em `contacts`, função de abertura atômica.
- `025_prospecting.sql` — campanhas/candidatos/credencial/lock de prospecção, `deals.source/external_id`.
- `038_mailbox_imap_sent_copy.sql` — colunas de IMAP em `email_mailboxes` (cópia em "Enviados"). **Rode antes de subir o código que a usa**: a tela e a listagem de caixas passam a ler essas colunas.

Rode no SQL Editor do Supabase, em ordem (024 → 025 → … → 038).

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
- **Gmail e Outlook já guardam a cópia sozinhos**: deixe o IMAP em branco neles, senão a mensagem aparece duas vezes.
- A cópia é gravada **depois** de o e-mail sair e de o estado da inscrição ser salvo. Falha de IMAP nunca derruba nem repete um envio: o erro aparece em *Cópia em Enviados falhou* na lista de caixas e a próxima tentativa acontece no minuto seguinte (uma por caixa por minuto, para um IMAP fora do ar não atrasar o lote).
- O evento `email_enviado` agora guarda também o `message_id` (cabeçalho `Message-ID`), útil para achar a mensagem no log do provedor.

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
Envio de WhatsApp pela cadência (o passo para a inscrição com `falha`), rastreio de
clique/resposta/bounce, inscrição automática por tag, threading real (`In-Reply-To`).
A contagem de aberturas é acumulada por inscrição (não por e-mail).
