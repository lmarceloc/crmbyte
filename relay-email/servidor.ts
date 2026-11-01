// Entrada do relay de e-mail (Node 22+). Ver docs/relay-email.md.
//   EMAIL_RELAY_SECRET   obrigatório, o mesmo configurado no CRM (≥ 32 caracteres)
//   PORT                 porta HTTP (padrão 8080)
//   NEXT_PUBLIC_SITE_URL nome EHLO do SMTP (padrão https://crm.agenciabyte.com)
import { criarServidorDoRelay } from "../src/lib/email/relay-servidor";

process.env.NEXT_PUBLIC_SITE_URL ||= "https://crm.agenciabyte.com";
const porta = Number(process.env.PORT) || 8080;

criarServidorDoRelay(process.env.EMAIL_RELAY_SECRET ?? "").listen(porta, () => {
  console.log(`[relay-email] ouvindo na porta ${porta}`);
});
