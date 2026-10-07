"use client"

// Aba "Anexos" do negócio: o vendedor sobe a proposta e manda ao cliente o link
// /p/<token>, que abre o arquivo e registra a abertura em Atividades
// (ver src/lib/anexos/abertura.ts). O arquivo fica num bucket privado.
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Copy, ExternalLink, FileText, Link2, Link2Off, Loader2, RefreshCw, Trash2, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useConfirmarExclusao } from "@/components/ui/confirmar-exclusao"
import { createClient } from "@/lib/supabase/client"
import { deleteAccountMedia, uploadAccountMedia } from "@/lib/storage/upload-media"
import { ANEXO_MAX_BYTES, BUCKET_ANEXOS } from "@/lib/anexos/abertura"
import { dataCurta, dataHora, Vazio } from "./shared"

interface Anexo {
  id: string
  file_path: string
  file_name: string
  size_bytes: number | null
  share_token: string
  share_enabled: boolean
  open_count: number
  last_opened_at: string | null
  created_at: string
}

const ACEITOS = ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx"

const tamanho = (b: number | null) =>
  b == null ? "" : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`

const linkDoAnexo = (token: string) => `${window.location.origin}/p/${token}`
const semExtensao = (nome: string) => nome.replace(/\.[^.]+$/, "")

export function AnexosDoNegocio({
  dealId,
  accountId,
  onQuantidade,
}: {
  dealId: string
  accountId: string
  onQuantidade: (n: number) => void
}) {
  const [anexos, setAnexos] = useState<Anexo[] | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const confirmar = useConfirmarExclusao()

  const carregar = useCallback(async () => {
    const { data, error } = await createClient()
      .from("deal_attachments")
      .select("id,file_path,file_name,size_bytes,share_token,share_enabled,open_count,last_opened_at,created_at")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
    if (error) return toast.error("Não foi possível carregar os anexos.")
    setAnexos(data)
    onQuantidade(data.length)
  }, [dealId, onQuantidade])

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 0)
    return () => clearTimeout(t)
  }, [carregar])

  async function enviar(arquivos: FileList | null) {
    const lista = Array.from(arquivos ?? [])
    if (!lista.length) return
    setEnviando(true)
    try {
      for (const f of lista) {
        if (f.size > ANEXO_MAX_BYTES) {
          toast.error(`${f.name}: maior que 20 MB.`)
          continue
        }
        const { path } = await uploadAccountMedia(BUCKET_ANEXOS, f)
        const { error } = await createClient().from("deal_attachments").insert({
          account_id: accountId,
          deal_id: dealId,
          file_path: path,
          file_name: f.name,
          mime_type: f.type || null,
          size_bytes: f.size,
        })
        if (error) {
          void deleteAccountMedia(BUCKET_ANEXOS, path).catch(() => {})
          throw new Error(error.message)
        }
      }
      toast.success(lista.length > 1 ? "Anexos enviados." : "Anexo enviado.")
    } catch (e) {
      toast.error(e instanceof Error && /mime|type/i.test(e.message) ? "Tipo de arquivo não aceito." : "Falha ao enviar o anexo.")
    } finally {
      setEnviando(false)
      if (input.current) input.current.value = ""
      void carregar()
    }
  }

  // O vendedor abre direto do bucket (URL assinada): passar por /p/ contaria como abertura do cliente.
  async function abrir(a: Anexo) {
    const aba = window.open("", "_blank")
    const { data, error } = await createClient().storage.from(BUCKET_ANEXOS).createSignedUrl(a.file_path, 60)
    if (error || !data) {
      aba?.close()
      return toast.error("Não foi possível abrir o arquivo.")
    }
    if (aba) aba.location.href = data.signedUrl
    else window.location.href = data.signedUrl
  }

  async function copiarLink(a: Anexo) {
    try {
      await navigator.clipboard.writeText(linkDoAnexo(a.share_token))
      toast.success("Link copiado.")
    } catch {
      toast.error("Não foi possível copiar. Copie manualmente: " + linkDoAnexo(a.share_token))
    }
  }

  // Texto com o link "por trás" (HTML), para colar no Outlook/Gmail; texto puro de reserva.
  async function copiarComoTexto(a: Anexo) {
    const url = linkDoAnexo(a.share_token)
    const texto = semExtensao(a.file_name)
    try {
      const html = `<a href="${url}">${texto.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)}</a>`
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([`${texto}: ${url}`], { type: "text/plain" }),
        }),
      ])
      toast.success(`Copiado "${texto}" com o link. Cole no e-mail.`)
    } catch {
      void copiarLink(a)
    }
  }

  async function atualizar(a: Anexo, campos: Partial<Pick<Anexo, "share_enabled" | "share_token">>, ok: string) {
    setOcupado(a.id)
    const { error } = await createClient().from("deal_attachments").update(campos).eq("id", a.id)
    setOcupado(null)
    if (error) return toast.error("Não foi possível salvar.")
    toast.success(ok)
    void carregar()
  }

  async function novoLink(a: Anexo) {
    const ok = await confirmar({
      titulo: "Gerar um novo link?",
      descricao: "O link antigo para de funcionar. Quem já recebeu precisará do novo.",
      confirmar: "Gerar novo link",
    })
    if (ok) void atualizar(a, { share_token: crypto.randomUUID().replace(/-/g, ""), share_enabled: true }, "Novo link gerado.")
  }

  async function excluir(a: Anexo) {
    if (!(await confirmar({ titulo: `Excluir "${a.file_name}"?`, confirmar: "Excluir" }))) return
    setOcupado(a.id)
    const { error } = await createClient().from("deal_attachments").delete().eq("id", a.id)
    setOcupado(null)
    if (error) return toast.error("Não foi possível excluir.")
    void deleteAccountMedia(BUCKET_ANEXOS, a.file_path).catch(() => {})
    toast.success("Anexo excluído.")
    void carregar()
  }

  return (
    <div className="space-y-4">
      <div
        className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          void enviar(e.dataTransfer.files)
        }}
      >
        <p>Arraste a proposta aqui ou</p>
        <Button size="sm" variant="outline" disabled={enviando} onClick={() => input.current?.click()}>
          {enviando ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Escolher arquivo
        </Button>
        <p className="text-xs">PDF, imagem, Word, Excel ou PowerPoint · até 20 MB</p>
        <input ref={input} type="file" accept={ACEITOS} multiple hidden onChange={(e) => void enviar(e.target.files)} />
      </div>

      {anexos === null && <div className="h-16 animate-pulse rounded-lg bg-muted" />}
      {anexos?.length === 0 && <Vazio>Nenhum anexo ainda.</Vazio>}
      <ul className="space-y-2">
        {anexos?.map((a) => (
          <li key={a.id} className="space-y-2 rounded-lg border p-3">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <FileText className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {[tamanho(a.size_bytes), `enviado em ${dataCurta(a.created_at)}`].filter(Boolean).join(" · ")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {!a.share_enabled
                    ? "Link desativado"
                    : a.open_count
                      ? `Aberto ${a.open_count}× · última vez em ${dataHora(a.last_opened_at!)}`
                      : "Ainda não aberto pelo cliente"}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 text-destructive"
                aria-label="Excluir anexo"
                disabled={ocupado === a.id}
                onClick={() => excluir(a)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={ocupado === a.id} onClick={() => abrir(a)}>
                <ExternalLink className="size-3.5" /> Abrir
              </Button>
              {a.share_enabled ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => copiarLink(a)}>
                    <Copy className="size-3.5" /> Copiar link
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => copiarComoTexto(a)}>
                    <Link2 className="size-3.5" /> Copiar como texto com link
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={ocupado === a.id}
                    onClick={() => atualizar(a, { share_enabled: false }, "Link desativado.")}
                  >
                    <Link2Off className="size-3.5" /> Desativar link
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={ocupado === a.id}
                  onClick={() => atualizar(a, { share_enabled: true }, "Link reativado.")}
                >
                  <Link2 className="size-3.5" /> Reativar link
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={ocupado === a.id} onClick={() => novoLink(a)}>
                <RefreshCw className="size-3.5" /> Novo link
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
