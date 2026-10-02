"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CURRENCIES } from "@/lib/currency";
import type {
  Company,
  Contact,
  Conversation,
  Deal,
  DealStatus,
  DealTemperature,
  PipelineStage,
  Profile,
} from "@/types";
import {
  DealContactsSection,
  type MembroDoNegocio,
} from "./deal-contacts-section";
import { TemperaturePicker } from "./temperature-badge";
import {
  DealProductsSection,
  totalDosItens,
  type ItemDoNegocio,
  type ProdutoDoCatalogo,
} from "./deal-products-section";
import { formatMoeda } from "@/lib/money";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Check,
  X,
  Trash2,
  MessageSquare,
  DollarSign,
  Loader2,
  Building2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

interface DealFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal?: Deal | null;
  pipelineId: string;
  stages: PipelineStage[];
  defaultStageId?: string;
  onSaved: () => void;
}

export function DealForm({
  open,
  onOpenChange,
  deal,
  pipelineId,
  stages,
  defaultStageId,
  onSaved,
}: DealFormProps) {
  const supabase = createClient();
  const { accountId, defaultCurrency } = useAuth();

  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [contactId, setContactId] = useState("");
  const [stageId, setStageId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [notes, setNotes] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [temperature, setTemperature] = useState<DealTemperature>("frio");
  const [membros, setMembros] = useState<MembroDoNegocio[]>([]);
  const [membrosBusy, setMembrosBusy] = useState(false);
  const [catalogo, setCatalogo] = useState<ProdutoDoCatalogo[]>([]);
  const [itens, setItens] = useState<ItemDoNegocio[]>([]);
  const [itensBusy, setItensBusy] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [novaEmpresa, setNovaEmpresa] = useState(false);
  const [novaEmpresaNome, setNovaEmpresaNome] = useState("");
  const [novaEmpresaSite, setNovaEmpresaSite] = useState("");
  const [criandoEmpresa, setCriandoEmpresa] = useState(false);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [linkedConversation, setLinkedConversation] =
    useState<Conversation | null>(null);

  const [saving, setSaving] = useState(false);
  const [statusAction, setStatusAction] = useState<DealStatus | null>(null);
  const [motivos, setMotivos] = useState<string[]>([]);
  const [lostReason, setLostReason] = useState("");
  const [lostNote, setLostNote] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset the form fields every time the sheet opens or its input
  // props change. This is a legitimate prop-driven sync; the rule is
  // over-cautious here, hence the block-level disable.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    if (deal) {
      setTitle(deal.title);
      setValue(String(deal.value ?? ""));
      setCurrency(deal.currency || defaultCurrency);
      // contact_id is nullable when the contact has been deleted
      // (migration 004: ON DELETE SET NULL). "" means "no selection".
      setContactId(deal.contact_id ?? "");
      setStageId(deal.stage_id);
      setAssignedTo(deal.assigned_to ?? "");
      setExpectedCloseDate(deal.expected_close_date ?? "");
      setNotes(deal.notes ?? "");
      setCompanyId(deal.company_id ?? "");
      setLinkedin(deal.linkedin_url ?? "");
      setTemperature(deal.temperature ?? "frio");
    } else {
      setTitle("");
      setValue("");
      setCurrency(defaultCurrency);
      setContactId("");
      setStageId(defaultStageId || stages[0]?.id || "");
      setAssignedTo("");
      setExpectedCloseDate("");
      setNotes("");
      setCompanyId("");
      setLinkedin("");
      setTemperature("frio");
      setMembros([]);
      setItens([]);
    }
    setNovaEmpresa(false);
    setNovaEmpresaNome("");
    setNovaEmpresaSite("");
  }, [open, deal, defaultStageId, stages, defaultCurrency]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Motivos de perda cadastrados em Configurações → Motivos
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("loss_reasons")
        .select("name")
        .eq("active", true)
        .order("created_at");
      if (!cancelled) setMotivos((data ?? []).map((m) => m.name as string));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Load supporting data once the sheet is open
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const [c, p, co, dc, cat, di] = await Promise.all([
        supabase.from("contacts").select("*").order("name"),
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("companies").select("*").order("name"),
        deal
          ? supabase
              .from("deal_contacts")
              .select("contact_id,is_primary")
              .eq("deal_id", deal.id)
              .order("created_at")
          : Promise.resolve({ data: null }),
        supabase.from("products").select("id,name,price").eq("active", true).order("name"),
        deal
          ? supabase
              .from("deal_products")
              .select("id,product_id,name,unit_price,quantity")
              .eq("deal_id", deal.id)
              .order("created_at")
          : Promise.resolve({ data: null }),
      ]);
      if (cancelled) return;
      setCatalogo(
        ((cat.data ?? []) as { id: string; name: string; price: number }[]).map((p) => ({
          id: p.id,
          name: p.name,
          price: Number(p.price),
        })),
      );
      if (deal) {
        setItens(
          ((di.data ?? []) as {
            id: string;
            product_id: string | null;
            name: string;
            unit_price: number;
            quantity: number;
          }[]).map((r) => ({
            id: r.id,
            productId: r.product_id,
            name: r.name,
            unitPrice: Number(r.unit_price),
            quantity: Number(r.quantity),
          })),
        );
      }
      setContacts((c.data ?? []) as Contact[]);
      setProfiles((p.data ?? []) as Profile[]);
      setCompanies((co.data ?? []) as Company[]);
      if (deal) {
        const linhas = (dc.data ?? []) as { contact_id: string; is_primary: boolean }[];
        // negócio antigo sem linhas: usa o contato do próprio negócio como principal
        setMembros(
          linhas.length > 0
            ? linhas.map((l) => ({ contactId: l.contact_id, isPrimary: l.is_primary }))
            : deal.contact_id
              ? [{ contactId: deal.contact_id, isPrimary: true }]
              : [],
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, supabase, deal]);

  // O contato principal alimenta o vínculo com a conversa e a validação.
  const principalId = membros.find((m) => m.isPrimary)?.contactId ?? "";
  useEffect(() => {
    setContactId(principalId);
  }, [principalId]);

  async function criarEmpresa() {
    const nome = novaEmpresaNome.trim();
    if (!nome || !accountId) return;
    const site = novaEmpresaSite.trim();
    if (site && !/^https?:\/\//i.test(site)) {
      toast.error("O site precisa começar com http:// ou https://");
      return;
    }
    setCriandoEmpresa(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("companies")
      .insert({ account_id: accountId, user_id: user?.id ?? null, name: nome, website: site || null })
      .select("*")
      .single();
    setCriandoEmpresa(false);
    if (error || !data) {
      toast.error(
        error?.code === "23505" ? "Já existe uma empresa com esse nome." : "Não foi possível criar a empresa.",
      );
      return;
    }
    setCompanies((cs) => [...cs, data as Company].sort((a, b) => a.name.localeCompare(b.name)));
    setCompanyId((data as Company).id);
    setNovaEmpresa(false);
    setNovaEmpresaNome("");
    setNovaEmpresaSite("");
  }

  // ---- contatos do negócio (na edição, gravam na hora; na criação, só no estado)
  async function adicionarMembro(cid: string) {
    if (membros.some((m) => m.contactId === cid)) return;
    const primeiro = membros.length === 0;
    if (deal) {
      setMembrosBusy(true);
      const { error } = await supabase.from("deal_contacts").insert({
        account_id: deal.account_id ?? accountId,
        deal_id: deal.id,
        contact_id: cid,
        is_primary: primeiro,
      });
      setMembrosBusy(false);
      if (error) {
        toast.error("Não foi possível adicionar o contato.");
        return;
      }
    }
    setMembros((ms) => [...ms, { contactId: cid, isPrimary: primeiro }]);
  }

  async function removerMembro(cid: string) {
    const removido = membros.find((m) => m.contactId === cid);
    const restantes = membros.filter((m) => m.contactId !== cid);
    const novoPrincipal = removido?.isPrimary ? restantes[0]?.contactId : undefined;
    if (deal) {
      setMembrosBusy(true);
      const { error } = await supabase
        .from("deal_contacts")
        .delete()
        .eq("deal_id", deal.id)
        .eq("contact_id", cid);
      if (!error && novoPrincipal) {
        await supabase
          .from("deal_contacts")
          .update({ is_primary: true })
          .eq("deal_id", deal.id)
          .eq("contact_id", novoPrincipal);
      }
      setMembrosBusy(false);
      if (error) {
        toast.error("Não foi possível remover o contato.");
        return;
      }
    }
    setMembros(restantes.map((m) => ({ ...m, isPrimary: m.isPrimary || m.contactId === novoPrincipal })));
  }

  async function tornarPrincipal(cid: string) {
    const antigo = membros.find((m) => m.isPrimary)?.contactId;
    if (deal) {
      setMembrosBusy(true);
      // ordem importa: só pode existir um principal por negócio
      if (antigo) {
        const r = await supabase
          .from("deal_contacts")
          .update({ is_primary: false })
          .eq("deal_id", deal.id)
          .eq("contact_id", antigo);
        if (r.error) {
          setMembrosBusy(false);
          toast.error("Não foi possível trocar o contato principal.");
          return;
        }
      }
      const { error } = await supabase
        .from("deal_contacts")
        .update({ is_primary: true })
        .eq("deal_id", deal.id)
        .eq("contact_id", cid);
      setMembrosBusy(false);
      if (error) {
        toast.error("Não foi possível trocar o contato principal.");
        return;
      }
    }
    setMembros((ms) => ms.map((m) => ({ ...m, isPrimary: m.contactId === cid })));
  }

  async function criarContatoRapido(d: { nome: string; email: string; telefone: string }) {
    if (!accountId) {
      toast.error("Seu perfil não está vinculado a uma conta.");
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Você não está autenticado.");
      return;
    }
    const empresa = companies.find((c) => c.id === companyId);
    const { data, error } = await supabase
      .from("contacts")
      .insert({
        account_id: accountId,
        user_id: user.id,
        name: d.nome,
        email: d.email || null,
        phone: d.telefone, // vazio é permitido ('' não entra no índice único)
        company: empresa?.name ?? null,
        company_id: empresa?.id ?? null,
      })
      .select("*")
      .single();
    if (error || !data) {
      toast.error(
        error?.code === "23505"
          ? "Já existe um contato com esse telefone."
          : "Não foi possível criar o contato.",
      );
      return;
    }
    setContacts((cs) => [...cs, data as Contact]);
    await adicionarMembro((data as Contact).id);
  }

  // ---- produtos do negócio (na edição gravam na hora; o trigger do banco recalcula deals.value)
  async function recarregarValor() {
    if (!deal) return;
    const { data } = await supabase.from("deals").select("value").eq("id", deal.id).maybeSingle();
    if (data) setValue(String(Number(data.value) || 0));
  }

  async function adicionarItem(produto: ProdutoDoCatalogo, quantidade: number) {
    const novo: ItemDoNegocio = {
      productId: produto.id,
      name: produto.name,
      unitPrice: produto.price,
      quantity: quantidade,
    };
    if (!deal) {
      setItens((is) => [...is, novo]);
      return;
    }
    setItensBusy(true);
    const { data, error } = await supabase
      .from("deal_products")
      .insert({
        account_id: deal.account_id ?? accountId,
        deal_id: deal.id,
        product_id: produto.id,
        name: produto.name,
        unit_price: produto.price,
        quantity: quantidade,
      })
      .select("id")
      .single();
    if (error || !data) {
      setItensBusy(false);
      toast.error("Não foi possível adicionar o produto.");
      return;
    }
    setItens((is) => [...is, { ...novo, id: data.id }]);
    await recarregarValor();
    setItensBusy(false);
  }

  async function alterarItem(indice: number, campos: { unitPrice?: number; quantity?: number }) {
    const atual = itens[indice];
    if (!atual) return;
    const antes = itens;
    setItens((is) => is.map((it, i) => (i === indice ? { ...it, ...campos } : it)));
    if (!deal || !atual.id) return;
    setItensBusy(true);
    const { error } = await supabase
      .from("deal_products")
      .update({
        ...(campos.unitPrice !== undefined ? { unit_price: campos.unitPrice } : {}),
        ...(campos.quantity !== undefined ? { quantity: campos.quantity } : {}),
      })
      .eq("id", atual.id);
    if (error) {
      setItens(antes);
      toast.error("Não foi possível atualizar o item.");
    } else {
      await recarregarValor();
    }
    setItensBusy(false);
  }

  async function removerItem(indice: number) {
    const atual = itens[indice];
    if (!atual) return;
    if (!deal || !atual.id) {
      setItens((is) => is.filter((_, i) => i !== indice));
      return;
    }
    setItensBusy(true);
    const { error } = await supabase.from("deal_products").delete().eq("id", atual.id);
    if (error) {
      toast.error("Não foi possível remover o item.");
    } else {
      setItens((is) => is.filter((_, i) => i !== indice));
      await recarregarValor();
    }
    setItensBusy(false);
  }

  // Fetch linked conversation for the selected contact (newest open one).
  // Clearing on no-selection is sync with prop state; the populated
  // case runs setLinkedConversation inside the async fetch callback.
  useEffect(() => {
    if (!open || !contactId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLinkedConversation(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("conversations")
        .select("*")
        .eq("contact_id", contactId)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setLinkedConversation((data as Conversation | null) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, contactId, supabase]);

  async function handleSave() {
    if (!title.trim() || !contactId || !stageId) {
      toast.error("Título, contato principal e etapa são obrigatórios");
      return;
    }
    const li = linkedin.trim();
    if (li && !/^https?:\/\//i.test(li)) {
      toast.error("O LinkedIn precisa começar com http:// ou https://");
      return;
    }
    setSaving(true);

    const payload = {
      title: title.trim(),
      value: itens.length > 0 ? Math.round(totalDosItens(itens) * 100) / 100 : parseFloat(value) || 0,
      currency,
      contact_id: contactId,
      pipeline_id: pipelineId,
      stage_id: stageId,
      assigned_to: assignedTo || null,
      notes: notes.trim() || null,
      expected_close_date: expectedCloseDate || null,
      company_id: companyId || null,
      linkedin_url: li || null,
      temperature,
    };

    if (deal) {
      const { error } = await supabase
        .from("deals")
        .update(payload)
        .eq("id", deal.id);
      if (error) {
        toast.error("Failed to save deal");
        setSaving(false);
        return;
      }
    } else {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        toast.error("Not signed in");
        setSaving(false);
        return;
      }
      if (!accountId) {
        toast.error("Your profile is not linked to an account.");
        setSaving(false);
        return;
      }
      const { data: criado, error } = await supabase
        .from("deals")
        .insert({ ...payload, user_id: user.id, account_id: accountId, status: "open" })
        .select("id")
        .single();
      if (error || !criado) {
        toast.error("Failed to create deal");
        setSaving(false);
        return;
      }
      // o trigger do banco já criou a linha do principal; os demais entram aqui
      const outros = membros.filter((m) => m.contactId !== contactId);
      if (outros.length > 0) {
        const { error: errMembros } = await supabase.from("deal_contacts").insert(
          outros.map((m) => ({
            account_id: accountId,
            deal_id: criado.id,
            contact_id: m.contactId,
            is_primary: false,
          })),
        );
        if (errMembros) toast.error("O negócio foi criado, mas alguns contatos não foram vinculados.");
      }
      if (itens.length > 0) {
        const { error: errItens } = await supabase.from("deal_products").insert(
          itens.map((it) => ({
            account_id: accountId,
            deal_id: criado.id,
            product_id: it.productId,
            name: it.name,
            unit_price: it.unitPrice,
            quantity: it.quantity,
          })),
        );
        if (errItens) toast.error("O negócio foi criado, mas os produtos não foram adicionados.");
      }
    }

    setSaving(false);
    toast.success(deal ? "Deal updated" : "Deal created");
    onOpenChange(false);
    onSaved();
  }

  async function handleStatusChange(status: DealStatus) {
    if (!deal) return;
    if (status === "lost" && !lostReason) {
      toast.error("Escolha o motivo da perda");
      return;
    }
    setStatusAction(status);
    const { error } = await supabase
      .from("deals")
      .update(
        status === "lost"
          ? { status, lost_reason: lostReason, lost_note: lostNote.trim() || null }
          : { status },
      )
      .eq("id", deal.id);
    setStatusAction(null);
    if (error) {
      toast.error("Failed to update deal status");
      return;
    }
    toast.success(
      status === "won" ? "Marked as won" : status === "lost" ? "Marked as lost" : "Deal reopened",
    );
    onOpenChange(false);
    onSaved();
  }

  async function handleDelete() {
    if (!deal) return;
    setDeleting(true);
    const { error } = await supabase.from("deals").delete().eq("id", deal.id);
    setDeleting(false);
    if (error) {
      toast.error("Failed to delete deal");
      return;
    }
    toast.success("Deal deleted");
    setConfirmDelete(false);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="bg-popover border-border text-popover-foreground sm:max-w-lg w-full p-0"
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-border/50 p-4">
            <SheetTitle className="text-popover-foreground">
              {deal ? "Edit Deal" : "New Deal"}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Deal title"
                className="border-border bg-muted text-foreground"
              />
            </div>

            <div className="grid gap-2">
              <Label className="flex items-center gap-1.5 text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                Empresa
              </Label>
              {novaEmpresa ? (
                <div className="space-y-2 rounded-md border border-border/60 bg-muted/40 p-2">
                  <Input
                    value={novaEmpresaNome}
                    onChange={(e) => setNovaEmpresaNome(e.target.value)}
                    placeholder="Nome da empresa"
                    className="border-border bg-muted text-foreground"
                  />
                  <Input
                    value={novaEmpresaSite}
                    onChange={(e) => setNovaEmpresaSite(e.target.value)}
                    placeholder="Site (https://…)"
                    className="border-border bg-muted text-foreground"
                  />
                  <div className="flex justify-end gap-2">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setNovaEmpresa(false)} disabled={criandoEmpresa}>
                      Cancelar
                    </Button>
                    <Button type="button" size="sm" onClick={criarEmpresa} disabled={criandoEmpresa || !novaEmpresaNome.trim()}>
                      {criandoEmpresa ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Criar empresa"}
                    </Button>
                  </div>
                </div>
              ) : (
                <select
                  value={companyId}
                  onChange={(e) => {
                    if (e.target.value === "__nova__") setNovaEmpresa(true);
                    else setCompanyId(e.target.value);
                  }}
                  className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="">Sem empresa</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="__nova__">+ Criar nova empresa…</option>
                </select>
              )}
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">LinkedIn do negócio</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={linkedin}
                  onChange={(e) => setLinkedin(e.target.value)}
                  placeholder="https://www.linkedin.com/…"
                  className="border-border bg-muted text-foreground"
                />
                {/^https?:\/\//i.test(linkedin.trim()) && (
                  <a
                    href={linkedin.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir no LinkedIn"
                    className="shrink-0 text-primary hover:opacity-80"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">Temperatura</Label>
              <TemperaturePicker value={temperature} onChange={setTemperature} />
            </div>

            <div className="grid gap-2">
              <DealContactsSection
                contatos={contacts}
                membros={membros}
                ocupado={membrosBusy}
                onAdicionar={adicionarMembro}
                onRemover={removerMembro}
                onPrincipal={tornarPrincipal}
                onCriar={criarContatoRapido}
              />
              {linkedConversation && (
                <Link
                  href="/inbox"
                  className="inline-flex items-center gap-1.5 self-start rounded-md bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20"
                >
                  <MessageSquare className="h-3 w-3" />
                  Conversa do contato principal
                </Link>
              )}
            </div>

            <DealProductsSection
              catalogo={catalogo}
              itens={itens}
              moeda={currency}
              ocupado={itensBusy}
              onAdicionar={adicionarItem}
              onAlterar={alterarItem}
              onRemover={removerItem}
            />

            <div className="grid grid-cols-[1fr_110px] gap-3">
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Value</Label>
                <div className="relative">
                  <DollarSign className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type={itens.length > 0 ? "text" : "number"}
                    value={itens.length > 0 ? formatMoeda(totalDosItens(itens), currency) : value}
                    onChange={(e) => setValue(e.target.value)}
                    readOnly={itens.length > 0}
                    placeholder="0"
                    className="border-border bg-muted pl-7 text-foreground read-only:opacity-80"
                  />
                </div>
                {itens.length > 0 && (
                  <p className="text-xs text-muted-foreground">Calculado pelos produtos.</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Currency</Label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">Expected Close Date</Label>
              <Input
                type="date"
                value={expectedCloseDate}
                onChange={(e) => setExpectedCloseDate(e.target.value)}
                className="border-border bg-muted text-foreground"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">Stage</Label>
              <select
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">Assigned To</Label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="">Unassigned</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes..."
                className="min-h-[100px] border-border bg-muted text-foreground"
              />
            </div>

            {deal && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/50 p-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Status
                </p>
                {deal.status !== "lost" && (
                  <div className="space-y-2">
                    <select
                      value={lostReason}
                      onChange={(e) => setLostReason(e.target.value)}
                      className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                      aria-label="Motivo da perda"
                    >
                      <option value="">
                        {motivos.length ? "Motivo da perda (se for perder)…" : "Cadastre motivos em Configurações"}
                      </option>
                      {motivos.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    {lostReason && (
                      <Input
                        value={lostNote}
                        onChange={(e) => setLostNote(e.target.value)}
                        placeholder="Detalhe (opcional)"
                      />
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => handleStatusChange("won")}
                    disabled={!!statusAction || deal.status === "won"}
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {statusAction === "won" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="mr-1 h-4 w-4" />
                        Mark as Won
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleStatusChange("lost")}
                    disabled={!!statusAction || deal.status === "lost"}
                    className="flex-1 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {statusAction === "lost" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <X className="mr-1 h-4 w-4" />
                        Mark as Lost
                      </>
                    )}
                  </Button>
                </div>
                {deal.status && deal.status !== "open" && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleStatusChange("open")}
                    disabled={!!statusAction}
                    className="w-full text-muted-foreground hover:text-foreground"
                  >
                    Reopen deal
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-border/50 bg-popover/80 p-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1 border-border bg-transparent text-muted-foreground hover:bg-muted"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !title.trim() || !contactId || !stageId}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {saving ? "Saving..." : deal ? "Save Changes" : "Create Deal"}
              </Button>
            </div>

            {deal &&
              (confirmDelete ? (
                <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs">
                  <span className="text-red-300">Delete this deal?</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                      className="rounded px-2 py-1 text-muted-foreground hover:bg-muted"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="rounded bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleting ? "Deleting..." : "Confirm"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="mt-3 flex w-full items-center justify-center gap-1 text-xs text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete Deal
                </button>
              ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
