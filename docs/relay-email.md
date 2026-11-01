# Relay de e-mail (SMTP/IMAP fora da Cloudflare)

## Por quê
Depois da mudança para a Cloudflare (21/10), as caixas da Umbler pararam: o Worker abre os
sockets SMTP/IMAP a partir de IPs **compartilhados e que mudam** a cada execução, e a Umbler
bloqueia parte deles (28/10: `104.28.152.58` conectava, `104.28.166.21` dava timeout — pelo
nome e pelo IP). Não dá para fixar o IP de saída de um Worker.

O relay é um servidor Node pequeno, rodando **fora da Cloudflare com IPv4 fixo**. O CRM
continua todo na Cloudflare; só as conexões SMTP/IMAP passam por ele:

```
Cloudflare Worker ──HTTPS + segredo──▶ relay (IP fixo) ──SMTP 587/465, IMAP 993──▶ Umbler
```

Microsoft 365 conectado pela Microsoft (Graph) não passa pelo relay: é HTTPS e já funciona.

## O que passa pelo relay
| Operação | Uso |
|---|---|
| `smtp/enviar` | envio da cadência, resumo semanal |
| `smtp/verificar` | salvar/testar caixa |
| `imap/copiar` | cópia em "Enviados" |
| `imap/verificar` | salvar/testar caixa |
| `imap/ler` | leitura da entrada (respostas, bounces) |

Sem `EMAIL_RELAY_URL` no CRM, tudo continua saindo do Worker como antes.

## Subir o relay
Qualquer lugar com **IPv4 de saída fixo** e Docker (ou Node 22): uma VPS (Hetzner, DigitalOcean,
Magalu Cloud, Hostinger…) ou Fly.io com IP de saída dedicado. Funções serverless (Vercel,
Supabase Edge) não servem: o IP de saída também muda.

1. Gere o segredo (≥ 32 caracteres): `openssl rand -hex 32`.
2. Na raiz do repositório:
   ```bash
   docker build -f relay-email/Dockerfile -t crmbyte-relay-email .
   docker run -d --restart=always --name relay-email -p 127.0.0.1:8080:8080 \
     -e EMAIL_RELAY_SECRET=<segredo> crmbyte-relay-email
   ```
   Sem Docker: `cd relay-email && npm ci && npm run build && EMAIL_RELAY_SECRET=<segredo> npm start`.
3. HTTPS na frente (a senha da caixa trafega no pedido). Com Caddy e um subdomínio
   apontado para a VPS (ex.: `relay.agenciabyte.com`, registro DNS **sem proxy**/nuvem cinza):
   ```
   relay.agenciabyte.com {
     reverse_proxy 127.0.0.1:8080
   }
   ```
4. `curl https://relay.agenciabyte.com/saude` → `{"ok":true,"ipv4":"…"}`. Esse `ipv4` é o que se
   pede para a Umbler liberar.

## Ligar no CRM
Cloudflare → Worker `crmbyte` → Settings → Variables and Secrets (tipo Secret):
- `EMAIL_RELAY_URL` = `https://relay.agenciabyte.com`
- `EMAIL_RELAY_SECRET` = o mesmo segredo do relay

Depois, em Caixas de envio, salve/teste a caixa da Umbler de novo. O teste de rede
(`/api/caixas-de-envio/teste-de-rede`) mostra `relay_de_email` com o IP do relay.

## Variáveis do relay
| Variável | |
|---|---|
| `EMAIL_RELAY_SECRET` | obrigatória, igual à do CRM |
| `PORT` | padrão `8080` |
| `NEXT_PUBLIC_SITE_URL` | nome EHLO do SMTP; padrão `https://crm.agenciabyte.com` |

O relay não acessa o banco nem guarda nada: recebe a configuração da caixa no pedido,
conecta, responde. Anti-SSRF (recusa host interno) roda nele também.
