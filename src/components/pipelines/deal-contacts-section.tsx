"use client";

import { TelefoneWhatsapp } from "@/components/whatsapp-phone-link"
import { linkWhatsapp } from "@/lib/whatsapp-link"
import { useState } from "react";
import { ExternalLink, Loader2, Plus, Star, Trash2, UserPlus } from "lucide-react";
import type { Contact } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { erroDoContatoNovo } from "@/lib/contato-obrigatorio";

export interface MembroDoNegocio {
  contactId: string;
  isPrimary: boolean;
}

interface Props {
  /** Todos os contatos da conta (para escolher e para exibir os dados). */
  contatos: Contact[];
  membros: MembroDoNegocio[];
  ocupado?: boolean;
  onAdicionar: (contactId: string) => void | Promise<void>;
  onRemover: (contactId: string) => void | Promise<void>;
  onPrincipal: (contactId: string) => void | Promise<void>;
  onCriar: (dados: { nome: string; email: string; telefone: string }) => Promise<void>;
}

const campo =
  "h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary";

const linkSeguro = (u?: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

export function DealContactsSection({
  contatos,
  membros,
  ocupado,
  onAdicionar,
  onRemover,
  onPrincipal,
  onCriar,
}: Props) {
  const [escolhido, setEscolhido] = useState("");
  const [criando, setCriando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");

  const porId = new Map(contatos.map((c) => [c.id, c]));
  const naoVinculados = contatos.filter((c) => !membros.some((m) => m.contactId === c.id));

  // Nome e e-mail para salvar; telefone é opcional.
  const podeCriar = erroDoContatoNovo({ nome, email }) === null;

  async function criar() {
    if (!podeCriar) return;
    setSalvando(true);
    try {
      await onCriar({ nome: nome.trim(), email: email.trim(), telefone: telefone.trim() });
      setNome("");
      setEmail("");
      setTelefone("");
      setCriando(false);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Contatos do negócio ({membros.length})
        </p>
        {ocupado && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {membros.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum contato neste negócio ainda. Adicione abaixo; o primeiro vira o principal.
        </p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-md border border-border/60 bg-background/40">
          {membros.map((m) => {
            const c = porId.get(m.contactId);
            const li = linkSeguro(c?.linkedin_url);
            return (
              <li key={m.contactId} className="flex items-start gap-2 p-2">
                <button
                  type="button"
                  title={m.isPrimary ? "Contato principal" : "Tornar principal"}
                  onClick={() => !m.isPrimary && onPrincipal(m.contactId)}
                  className={`mt-0.5 shrink-0 ${
                    m.isPrimary ? "text-amber-500" : "text-muted-foreground hover:text-amber-500"
                  }`}
                >
                  <Star className={`h-4 w-4 ${m.isPrimary ? "fill-current" : ""}`} />
                </button>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="flex flex-wrap items-center gap-1.5 font-medium text-foreground">
                    <span className="truncate">{c?.name || c?.phone || "Contato"}</span>
                    {linkWhatsapp(c?.phone) && <TelefoneWhatsapp phone={c?.phone} className="text-xs font-normal" />}
                    {m.isPrimary && (
                      <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500">
                        Principal
                      </span>
                    )}
                  </p>
                  {c?.job_title && <p className="truncate text-xs text-muted-foreground">{c.job_title}</p>}
                  {c?.email && <p className="truncate text-xs text-muted-foreground">{c.email}</p>}
                  {li && (
                    <a
                      href={li}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      LinkedIn
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  title="Remover do negócio"
                  onClick={() => onRemover(m.contactId)}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex gap-2">
        <select value={escolhido} onChange={(e) => setEscolhido(e.target.value)} className={campo}>
          <option value="">Adicionar contato existente…</option>
          {naoVinculados.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name || c.phone || c.email}
              {c.email ? ` — ${c.email}` : ""}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!escolhido}
          onClick={async () => {
            await onAdicionar(escolhido);
            setEscolhido("");
          }}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Adicionar
        </Button>
      </div>

      {criando ? (
        <div className="space-y-2 rounded-md border border-border/60 bg-background/40 p-2">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} className="border-border bg-muted text-foreground" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">E-mail *</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="border-border bg-muted text-foreground" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Telefone (opcional)</Label>
              <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} className="border-border bg-muted text-foreground" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setCriando(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={criar} disabled={salvando || !podeCriar}>
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Criar e adicionar"}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCriando(true)}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Criar novo contato
        </button>
      )}
    </div>
  );
}
