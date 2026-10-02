"use client"

import { MessageCircle } from "lucide-react"

import { linkWhatsapp, telefoneFormatado } from "@/lib/whatsapp-link"

/**
 * Telefone que abre o WhatsApp em nova aba. Sem telefone válido mostra "—",
 * sem link. `stopPropagation` evita disparar linhas/cartões clicáveis.
 */
export function TelefoneWhatsapp({ phone, className }: { phone?: string | null; className?: string }) {
  const href = linkWhatsapp(phone)
  if (!href) return <span className={className}>{telefoneFormatado(phone)}</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Abrir conversa no WhatsApp"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 text-primary hover:underline ${className ?? ""}`}
    >
      <MessageCircle className="size-3.5 shrink-0" />
      {telefoneFormatado(phone)}
    </a>
  )
}
