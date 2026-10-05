"use client";

import { useState } from "react";
import { Loader2, Package, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoeda, parseValorBr, valorParaCampo } from "@/lib/money";

export interface ProdutoDoCatalogo {
  id: string;
  name: string;
  price: number;
}

/** Item do negócio. `id` só existe depois de gravado em deal_products. */
export interface ItemDoNegocio {
  id?: string;
  productId: string | null;
  name: string;
  unitPrice: number;
  quantity: number;
}

export const totalDosItens = (itens: ItemDoNegocio[]) =>
  itens.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

interface Props {
  catalogo: ProdutoDoCatalogo[];
  itens: ItemDoNegocio[];
  moeda: string;
  ocupado: boolean;
  onAdicionar: (produto: ProdutoDoCatalogo, quantidade: number) => void;
  onAlterar: (indice: number, campos: { unitPrice?: number; quantity?: number }) => void;
  onRemover: (indice: number) => void;
}

/**
 * "Produtos" do negócio: escolhe do catálogo, ajusta preço/quantidade por
 * linha (o preço pode divergir do catálogo, ex.: desconto) e mostra o total.
 */
export function DealProductsSection({ catalogo, itens, moeda, ocupado, onAdicionar, onAlterar, onRemover }: Props) {
  const [produtoId, setProdutoId] = useState("");
  const [qtd, setQtd] = useState("1");

  function adicionar() {
    const produto = catalogo.find((p) => p.id === produtoId);
    const q = parseValorBr(qtd);
    if (!produto || q === null || q <= 0) return;
    onAdicionar(produto, q);
    setProdutoId("");
    setQtd("1");
  }

  return (
    // minmax(0,1fr): sem isso a coluna automática cresce até o nome inteiro do produto no <select> e estoura o painel
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
      <Label className="flex items-center gap-1.5 text-muted-foreground">
        <Package className="h-3.5 w-3.5" />
        Produtos
        {ocupado && <Loader2 className="h-3 w-3 animate-spin" />}
      </Label>

      {itens.length > 0 && (
        <ul className="divide-y rounded-md border border-border/60">
          {itens.map((item, i) => (
            <LinhaItem
              key={item.id ?? `novo-${i}-${item.productId}`}
              item={item}
              moeda={moeda}
              onAlterar={(c) => onAlterar(i, c)}
              onRemover={() => onRemover(i)}
            />
          ))}
          <li className="flex items-center justify-between bg-muted/40 px-3 py-2 text-sm font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatMoeda(totalDosItens(itens), moeda)}</span>
          </li>
        </ul>
      )}

      <div className="flex items-center gap-2">
        <select
          value={produtoId}
          onChange={(e) => setProdutoId(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="">{catalogo.length === 0 ? "Nenhum produto cadastrado" : "Escolha um produto…"}</option>
          {catalogo.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {formatMoeda(p.price, moeda)}
            </option>
          ))}
        </select>
        <Input
          aria-label="Quantidade"
          inputMode="decimal"
          value={qtd}
          onChange={(e) => setQtd(e.target.value)}
          className="w-16 border-border bg-muted text-center text-foreground"
        />
        <Button type="button" size="sm" variant="outline" onClick={adicionar} disabled={!produtoId || ocupado}>
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </Button>
      </div>
      {catalogo.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Cadastre produtos em Configurações → Produtos para adicioná-los aos negócios.
        </p>
      )}
    </div>
  );
}

function LinhaItem({
  item,
  moeda,
  onAlterar,
  onRemover,
}: {
  item: ItemDoNegocio;
  moeda: string;
  onAlterar: (c: { unitPrice?: number; quantity?: number }) => void;
  onRemover: () => void;
}) {
  const [preco, setPreco] = useState(valorParaCampo(item.unitPrice));
  const [quantidade, setQuantidade] = useState(String(item.quantity).replace(".", ","));

  function confirmarPreco() {
    const v = parseValorBr(preco);
    if (v === null || v < 0) return setPreco(valorParaCampo(item.unitPrice)); // volta ao valor válido
    setPreco(valorParaCampo(v));
    if (v !== item.unitPrice) onAlterar({ unitPrice: Math.round(v * 100) / 100 });
  }
  function confirmarQuantidade() {
    const v = parseValorBr(quantidade);
    if (v === null || v <= 0) return setQuantidade(String(item.quantity).replace(".", ","));
    setQuantidade(String(v).replace(".", ","));
    if (v !== item.quantity) onAlterar({ quantity: v });
  }

  return (
    <li className="space-y-1.5 px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-medium">{item.name}</span>
        <button type="button" onClick={onRemover} aria-label={`Remover ${item.name}`} className="shrink-0 text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Input
          aria-label={`Quantidade de ${item.name}`}
          inputMode="decimal"
          value={quantidade}
          onChange={(e) => setQuantidade(e.target.value)}
          onBlur={confirmarQuantidade}
          className="h-7 w-14 border-border bg-muted text-center text-foreground"
        />
        <span>×</span>
        <Input
          aria-label={`Preço unitário de ${item.name}`}
          inputMode="decimal"
          value={preco}
          onChange={(e) => setPreco(e.target.value)}
          onBlur={confirmarPreco}
          className="h-7 w-28 border-border bg-muted text-right text-foreground"
        />
        <span className="ml-auto tabular-nums text-foreground">{formatMoeda(item.unitPrice * item.quantity, moeda)}</span>
      </div>
    </li>
  );
}
