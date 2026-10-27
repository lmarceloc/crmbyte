# Deploy na Cloudflare (Workers + OpenNext)

O app Next.js (telas, rotas `/api/*`, workers) roda como um Worker via
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare). Supabase (banco, auth,
storage, realtime) não muda.

## Arquivos
| Arquivo | Papel |
|---|---|
| `wrangler.jsonc` | Worker `crmbyte`: compat `nodejs_compat`, CPU 5 min, crons, domínio `crm.agenciabyte.com` |
| `open-next.config.ts` | Config do OpenNext (sem cache incremental — o app é dinâmico) |
| `worker.ts` | Entrada do Worker: handler do OpenNext + `scheduled()` dos Cron Triggers |

## Requisitos
- **Workers Paid** (US$ 5/mês): o bundle (~4,2 MB gzip) passa do limite de 3 MB do plano grátis,
  e as rotas de worker precisam de mais que 10 ms de CPU.
- Zona `agenciabyte.com` na mesma conta. Apague o CNAME `crm` da Vercel antes do 1º deploy.

## Workers Builds (conectado ao GitHub)
- Build command: `npx opennextjs-cloudflare build`
- Deploy command: `npx opennextjs-cloudflare deploy`
- Builds de preview: desligados (ou `npx wrangler versions upload`).

## Variáveis
**Build** (Settings → Build → Variables and secrets) — entram no bundle do navegador:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`.

**Runtime** (Settings → Variables and Secrets, tipo Secret) — as 3 acima e:
`SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY`, `CADENCIA_TOKEN_SECRET`, `CRON_SECRET`,
`AUTOMATION_CRON_SECRET`, `META_APP_ID`, `META_APP_SECRET`, `MICROSOFT_CLIENT_ID`,
`MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI` (opcional), `SMTP_HOST`, `SMTP_PORT`,
`SMTP_SECURITY`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`,
`ABACATEPAY_API_KEY`, `ABACATEPAY_WEBHOOK_SECRET`, `ALLOWED_INVITE_HOSTS`, `CADENCIA_LIMITE_EMAILS_POR_DIA`, `WHATSAPP_TEMPLATES_DRY_RUN` (as opcionais só se existiam na Vercel).

> `ENCRYPTION_KEY` e `CADENCIA_TOKEN_SECRET` têm que ser **idênticas** às da Vercel:
> a primeira decifra senhas/tokens salvos no banco; a segunda valida links de descadastro/pixel já enviados.

## Crons (substituem o crontab externo)
| Cron | Rotas |
|---|---|
| `* * * * *` | `/api/cadencias/worker`, `/api/prospecting/worker`, `/api/automations/cron` |
| `*/5 * * * *` | `/api/flows/cron` |

O `scheduled()` chama as rotas internamente (sem sair para a rede) com `Authorization: Bearer
$CRON_SECRET` e `x-cron-secret: $AUTOMATION_CRON_SECRET`. Desligue o crontab/pinger externo
depois da virada. Logs: Worker → Observability.

## E-mail
SMTP (`nodemailer`) e IMAP (`imapflow`) usam sockets TCP do Workers (`nodejs_compat`).
Testado localmente no workerd: SMTP e upgrade STARTTLS funcionam. Cloudflare bloqueia a porta 25
de saída — use 587 (STARTTLS) ou 465 (TLS), que é o que Umbler/Microsoft 365 usam.

## Local
`npm run preview` (build + wrangler dev com `.dev.vars`) · `npm run deploy`.
