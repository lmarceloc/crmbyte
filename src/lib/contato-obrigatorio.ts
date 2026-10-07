// O que é preciso para SALVAR um contato novo à mão: nome e e-mail.
// Telefone é opcional — `contacts.phone` só não pode ser nulo, e vazio vale (o
// índice único da 022 ignora telefone vazio). Contatos da prospecção B2B e do
// WhatsApp nascem sem um dos dois, por isso a regra vale para a criação manual,
// não para quem edita um contato que veio de fora.

export const EMAIL =/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mensagem (em português) do que falta para criar o contato, ou null se está tudo certo. */
export function erroDoContatoNovo(c: { nome?: string | null; email?: string | null }): string | null {
  if (!(c.nome ?? "").trim()) return "Informe o nome do contato.";
  const email = (c.email ?? "").trim();
  if (!email) return "Informe o e-mail do contato.";
  if (!EMAIL.test(email)) return "E-mail inválido.";
  return null;
}
