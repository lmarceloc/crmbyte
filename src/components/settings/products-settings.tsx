"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Loader2, Package, Pencil, Plus, Trash2 } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { formatMoeda, parseValorBr, valorParaCampo } from "@/lib/money"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { SettingsPanelHead } from "./settings-panel-head"

interface Produto {
  id: string
  name: string
  description: string | null
  price: number
  active: boolean
}

/**
 * Catálogo de produtos da conta (ex.: "Integração", R$ 7.000). Os produtos são
 * adicionados aos negócios; o valor do negócio passa a ser a soma dos itens.
 * Só admin+ edita (RLS de `products`); os demais papéis apenas consultam.
 */
export function ProductsSettings() {
  const supabase = createClient()
  const { accountId, user, defaultCurrency, canEditSettings } = useAuth()

  const [produtos, setProdutos] = useState<Produto[] | null>(null)
  const [busca, setBusca] = useState("")
  const [erro, setErro] = useState<string | null>(null)

  const [dialogo, setDialogo] = useState<{ aberto: boolean; produto: Produto | null }>({ aberto: false, produto: null })
  const [nome, setNome] = useState("")
  const [descricao, setDescricao] = useState("")
  const [preco, setPreco] = useState("")
  const [ativo, setAtivo] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [excluir, setExcluir] = useState<Produto | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from("products")
      .select("id,name,description,price,active")
      .order("name")
    if (error) {
      setErro(error.message)
      return
    }
    setErro(null)
    setProdutos(((data ?? []) as Produto[]).map((p) => ({ ...p, price: Number(p.price) })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = setTimeout(carregar, 0)
    return () => clearTimeout(t)
  }, [carregar])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return (produtos ?? []).filter((p) => !q || p.name.toLowerCase().includes(q))
  }, [produtos, busca])

  function abrir(produto: Produto | null) {
    setNome(produto?.name ?? "")
    setDescricao(produto?.description ?? "")
    setPreco(produto ? valorParaCampo(produto.price) : "")
    setAtivo(produto?.active ?? true)
    setDialogo({ aberto: true, produto })
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!accountId) return toast.error("Conta não identificada.")
    const nomeLimpo = nome.trim()
    if (!nomeLimpo) return toast.error("Informe o nome do produto.")
    const valor = preco.trim() === "" ? 0 : parseValorBr(preco)
    if (valor === null || valor < 0) return toast.error("Preço inválido.")
    setSalvando(true)
    const campos = {
      name: nomeLimpo,
      description: descricao.trim() || null,
      price: Math.round(valor * 100) / 100,
      active: ativo,
    }
    const { error } = dialogo.produto
      ? await supabase.from("products").update(campos).eq("id", dialogo.produto.id)
      : await supabase.from("products").insert({ ...campos, account_id: accountId, created_by: user?.id ?? null })
    setSalvando(false)
    if (error) {
      return toast.error(error.code === "23505" ? "Já existe um produto com esse nome." : error.message)
    }
    toast.success(dialogo.produto ? "Produto atualizado" : "Produto criado")
    setDialogo({ aberto: false, produto: null })
    carregar()
  }

  async function confirmarExclusao() {
    if (!excluir) return
    setExcluindo(true)
    const { error } = await supabase.from("products").delete().eq("id", excluir.id)
    setExcluindo(false)
    if (error) return toast.error(error.message)
    toast.success("Produto excluído")
    setExcluir(null)
    carregar()
  }

  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Produtos"
        description="Cadastre o que você vende, com o valor. Ao adicionar produtos a um negócio, o valor do negócio passa a ser a soma deles. Negócios que já usam um produto guardam o nome e o preço da época: editar ou excluir aqui não altera negócios existentes."
        action={
          canEditSettings ? (
            <Button onClick={() => abrir(null)}>
              <Plus className="size-4" /> Novo produto
            </Button>
          ) : null
        }
      />

      <div className="mb-3">
        <Input placeholder="Buscar produto…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-xs" />
      </div>

      {erro && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{erro}</div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3">Produto</th>
              <th className="p-3 text-right">Preço</th>
              <th className="p-3">Situação</th>
              <th className="w-24 p-3" />
            </tr>
          </thead>
          <tbody>
            {produtos === null && !erro && (
              <tr>
                <td colSpan={4} className="p-6 text-center">
                  <Loader2 className="mx-auto size-4 animate-spin" />
                </td>
              </tr>
            )}
            {produtos !== null && filtrados.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-muted-foreground">
                  <Package className="mx-auto mb-2 size-6" />
                  {produtos.length === 0
                    ? canEditSettings
                      ? "Nenhum produto ainda. Crie o primeiro, por exemplo “Integração”."
                      : "Nenhum produto cadastrado."
                    : "Nenhum produto encontrado."}
                </td>
              </tr>
            )}
            {filtrados.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="p-3">
                  <div className="font-medium">{p.name}</div>
                  {p.description && <div className="line-clamp-1 text-xs text-muted-foreground">{p.description}</div>}
                </td>
                <td className="p-3 text-right tabular-nums">{formatMoeda(p.price, defaultCurrency)}</td>
                <td className="p-3">
                  <Badge variant={p.active ? "outline" : "secondary"}>{p.active ? "Ativo" : "Inativo"}</Badge>
                </td>
                <td className="p-3 text-right">
                  {canEditSettings && (
                    <span className="inline-flex gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label={`Editar ${p.name}`} onClick={() => abrir(p)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label={`Excluir ${p.name}`} onClick={() => setExcluir(p)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!canEditSettings && (
        <p className="mt-2 text-xs text-muted-foreground">Somente administradores podem criar ou editar produtos.</p>
      )}

      <Dialog open={dialogo.aberto} onOpenChange={(a) => !a && setDialogo({ aberto: false, produto: null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogo.produto ? "Editar produto" : "Novo produto"}</DialogTitle>
            <DialogDescription>Nome e valor padrão. No negócio, o preço de cada item ainda pode ser ajustado.</DialogDescription>
          </DialogHeader>
          <form onSubmit={salvar} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="prod-nome">Nome *</Label>
              <Input id="prod-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Integração" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-preco">Preço ({defaultCurrency})</Label>
              <Input
                id="prod-preco"
                inputMode="decimal"
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                onBlur={() => {
                  const v = parseValorBr(preco)
                  if (v !== null && v >= 0) setPreco(valorParaCampo(v))
                }}
                placeholder="7.000,00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-desc">Descrição</Label>
              <Input id="prod-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Opcional" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={ativo} onCheckedChange={setAtivo} />
              Ativo (aparece na lista ao adicionar a um negócio)
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogo({ aberto: false, produto: null })}>
                Cancelar
              </Button>
              <Button type="submit" disabled={salvando}>
                {salvando && <Loader2 className="size-4 animate-spin" />} Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!excluir} onOpenChange={(a) => !a && setExcluir(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir produto?</DialogTitle>
            <DialogDescription>
              “{excluir?.name}” sai do catálogo. Negócios que já o usam continuam com o item, o nome e o preço originais.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluir(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={excluindo} onClick={confirmarExclusao}>
              {excluindo && <Loader2 className="size-4 animate-spin" />} Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
