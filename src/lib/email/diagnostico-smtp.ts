// Traduz a recusa do servidor SMTP/IMAP em algo que o usuário consiga resolver.
// O Microsoft 365 explica o motivo no próprio erro (5.7.139, 5.7.30 ...) — antes
// isso era trocado por uma frase genérica e o usuário ficava sem saber o que fazer.

export const ehMicrosoft = (host: string) => /(^|\.)(office365\.com|outlook\.com|office\.com|hotmail\.com)$/i.test(host.trim());

export function mensagemDeFalhaSmtp(
  host: string,
  tipo: "authentication_failed" | "connection_failed",
  detalhe: string,
): string {
  const d = detalhe.replace(/\s+/g, " ").trim();
  const resposta = d ? ` (resposta do servidor: ${d.slice(0, 300)})` : "";

  if (ehMicrosoft(host)) {
    if (/SmtpClientAuthentication is disabled/i.test(d))
      return (
        "O Microsoft 365 está com o SMTP autenticado desligado para esta caixa ou para a organização. " +
        "Um administrador precisa ligar: Centro de administração do Microsoft 365 → Usuários ativos → a caixa → " +
        "E-mail → Gerenciar aplicativos de e-mail → marcar \"SMTP autenticado\" (e, se estiver desligado na organização, " +
        "Exchange → Configurações → Fluxo de e-mail). Pode levar até 1 hora para valer." +
        resposta
      );
    if (/security defaults/i.test(d))
      return (
        "Os \"Padrões de segurança\" do Microsoft Entra estão ligados e bloqueiam login por senha no SMTP (inclusive senha de app). " +
        "Um administrador precisa desligá-los (Entra → Propriedades → Gerenciar padrões de segurança) ou liberar o SMTP por política de acesso condicional." +
        resposta
      );
    if (/5\.7\.30|basic auth(entication)? (is )?(not supported|disabled|retired)/i.test(d))
      return (
        "O Microsoft 365 desta organização não aceita mais login por senha no SMTP (Basic Auth desligado); só OAuth funciona. " +
        "Use outra caixa de envio (ex.: Gmail/Workspace ou o SMTP do seu provedor de domínio)." +
        resposta
      );
    if (tipo === "authentication_failed")
      return (
        "O Microsoft 365 recusou o usuário/senha. Confira: usuário = e-mail completo da caixa; servidor smtp.office365.com, " +
        "porta 587, STARTTLS; a senha de app só funciona se a conta usa MFA por usuário (não com Padrões de segurança) " +
        "e se o SMTP autenticado estiver ligado na caixa." +
        resposta
      );
  }

  if (tipo === "authentication_failed")
    return `Usuário ou senha recusados pelo servidor. No Gmail/Outlook use uma senha de app.${resposta}`;
  return `Não foi possível conectar ao servidor SMTP (587 = STARTTLS, 465 = TLS): ${d}`;
}

/** Microsoft 365 não aceita IMAP com senha (só OAuth): avisa antes de tentar o login. */
export function imapIndisponivel(imapHost: string | null): string | null {
  if (imapHost && ehMicrosoft(imapHost))
    return "O Microsoft 365 não aceita IMAP com senha (só OAuth). Deixe o servidor IMAP em branco: o envio funciona, mas respostas e bounces não serão detectados.";
  return null;
}

/** Sem usuário o teste só abre a conexão e "passa"; o 365 recusa depois, no envio (5.7.57). */
export function exigeLogin(smtpHost: string, usuario: string): string | null {
  if (!usuario.trim() && ehMicrosoft(smtpHost))
    return "O Microsoft 365 exige usuário e senha: sem login a caixa salva, mas todo envio é recusado (530 5.7.57). Informe o usuário (nome de login da conta, o UPN) e a senha de app.";
  return null;
}
