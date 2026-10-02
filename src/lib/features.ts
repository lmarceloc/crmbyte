/**
 * Recursos escondidos da interface. NADA é apagado: para reativar uma parte,
 * troque o valor para `true`.
 *
 * Mantidos de propósito: /flows (para avaliar o reaproveitamento num chat do
 * site) e os links "abrir no WhatsApp" no número dos contatos.
 */
export const RECURSOS = {
  /** /inbox — caixa de entrada de conversas do WhatsApp */
  caixaDeEntrada: false,
  /** /broadcasts — transmissões por template do WhatsApp */
  transmissoes: false,
  /** /automations — automações (acoplagem forte com mensagens do WhatsApp) */
  automacoes: false,
  /** Configurações → WhatsApp e Templates, e métricas de conversa no painel */
  configWhatsapp: false,
} as const;
