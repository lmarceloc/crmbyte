// HTML/texto do e-mail de resumo semanal (puro: testável sem banco).
import { formatCurrency } from "@/lib/currency";
import { formatarDia, type Semana } from "./periodo";
import type { ResumoSemanal } from "./dados";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const COR = { texto: "#111827", suave: "#6b7280", borda: "#e5e7eb", fundo: "#f9fafb", marca: "#7c3aed" };

function cartao(rotulo: string, valor: string | number, detalhe = "") {
  return `<td style="padding:6px;width:25%;vertical-align:top">
    <div style="border:1px solid ${COR.borda};border-radius:10px;padding:12px;background:#fff">
      <div style="font-size:12px;color:${COR.suave}">${esc(rotulo)}</div>
      <div style="font-size:22px;font-weight:700;color:${COR.texto};margin-top:4px">${esc(String(valor))}</div>
      ${detalhe ? `<div style="font-size:11px;color:${COR.suave};margin-top:2px">${esc(detalhe)}</div>` : ""}
    </div></td>`;
}

function secao(titulo: string, cartoes: string[]) {
  return `<h2 style="font-size:15px;color:${COR.texto};margin:22px 0 6px">${esc(titulo)}</h2>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${cartoes.join("")}</tr></table>`;
}

export interface DadosDoEmail {
  nomeDaConta: string;
  moeda: string;
  semana: Semana;
  resumo: ResumoSemanal;
  urlDoPainel: string;
}

export function assuntoDoResumo(d: DadosDoEmail): string {
  return `Resumo semanal · ${d.nomeDaConta} · ${formatarDia(d.semana.inicio)} a ${formatarDia(new Date(d.semana.fim.getTime() - 1))}`;
}

export function htmlDoResumo(d: DadosDoEmail): string {
  const r = d.resumo;
  const periodo = `${formatarDia(d.semana.inicio)} a ${formatarDia(new Date(d.semana.fim.getTime() - 1))}`;
  const totalTemp = r.temperatura.frio + r.temperatura.morno + r.temperatura.quente || 1;
  const pct = (n: number) => `${Math.round((n / totalTemp) * 100)}%`;
  const linhasDonos = r.porDono
    .map(
      (x) => `<tr>
      <td style="padding:8px;border-top:1px solid ${COR.borda}">${esc(x.nome)}</td>
      <td style="padding:8px;border-top:1px solid ${COR.borda};text-align:right">${x.abertos}</td>
      <td style="padding:8px;border-top:1px solid ${COR.borda};text-align:right">${x.quentes}</td>
      <td style="padding:8px;border-top:1px solid ${COR.borda};text-align:right">${x.novos}</td>
      <td style="padding:8px;border-top:1px solid ${COR.borda};text-align:right">${x.tarefasPendentes}</td>
    </tr>`,
    )
    .join("");

  return `<!doctype html><html><body style="margin:0;background:${COR.fundo};font-family:Arial,Helvetica,sans-serif">
<div style="max-width:640px;margin:0 auto;padding:24px 16px">
  <div style="font-size:12px;color:${COR.suave}">${esc(d.nomeDaConta)}</div>
  <h1 style="font-size:20px;color:${COR.texto};margin:4px 0 0">Resumo semanal</h1>
  <div style="font-size:13px;color:${COR.suave}">${periodo}</div>

  ${secao("Negócios", [
    cartao("Abertos", r.negocios.abertos, formatCurrency(r.negocios.valorAberto, d.moeda)),
    cartao("Novos leads", r.negocios.novos, `${r.novosContatos} contato(s) novo(s)`),
    cartao("Ganhos", r.negocios.ganhos, "na semana"),
    cartao("Perdidos", r.negocios.perdidos, "na semana"),
  ])}

  ${secao("Tarefas", [
    cartao("Realizadas", r.tarefas.realizadas, "na semana"),
    cartao("Adiadas", r.tarefas.adiadas, "prazo empurrado"),
    cartao("Não completas", r.tarefas.atrasadas, "atrasadas hoje"),
    cartao("Pendentes", r.tarefas.pendentes, "no total"),
  ])}

  ${secao("Cadências", [
    cartao("Ativas", r.cadencias.ativas),
    cartao("Leads em cadência", r.cadencias.leadsEmCadencia),
    cartao("E-mails enviados", r.cadencias.emailsEnviados, "na semana"),
    cartao("Aberturas", r.cadencias.aberturas, "na semana"),
  ])}

  ${secao("Temperatura dos negócios abertos", [
    cartao("Quentes", r.temperatura.quente, pct(r.temperatura.quente)),
    cartao("Mornos", r.temperatura.morno, pct(r.temperatura.morno)),
    cartao("Frios", r.temperatura.frio, pct(r.temperatura.frio)),
  ])}

  <h2 style="font-size:15px;color:${COR.texto};margin:22px 0 6px">Por dono</h2>
  ${
    r.porDono.length === 0
      ? `<p style="font-size:13px;color:${COR.suave}">Nenhum negócio aberto.</p>`
      : `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff;border:1px solid ${COR.borda};border-radius:10px;font-size:13px;color:${COR.texto}">
    <tr style="color:${COR.suave};font-size:12px">
      <td style="padding:8px">Dono</td><td style="padding:8px;text-align:right">Abertos</td>
      <td style="padding:8px;text-align:right">Quentes</td><td style="padding:8px;text-align:right">Novos</td>
      <td style="padding:8px;text-align:right">Tarefas pend.</td>
    </tr>${linhasDonos}</table>`
  }

  ${
    d.urlDoPainel
      ? `<p style="margin:24px 0 0"><a href="${esc(d.urlDoPainel)}" style="background:${COR.marca};color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:13px">Abrir o painel</a></p>`
      : ""
  }
  <p style="font-size:11px;color:${COR.suave};margin-top:24px">Enviado toda segunda-feira para donos e administradores da conta.</p>
</div></body></html>`;
}

export function textoDoResumo(d: DadosDoEmail): string {
  const r = d.resumo;
  return [
    `Resumo semanal · ${d.nomeDaConta} · ${formatarDia(d.semana.inicio)} a ${formatarDia(new Date(d.semana.fim.getTime() - 1))}`,
    "",
    `NEGÓCIOS: ${r.negocios.abertos} abertos (${formatCurrency(r.negocios.valorAberto, d.moeda)}), ${r.negocios.novos} novos leads, ${r.negocios.ganhos} ganhos, ${r.negocios.perdidos} perdidos. Contatos novos: ${r.novosContatos}.`,
    `TAREFAS: ${r.tarefas.realizadas} realizadas, ${r.tarefas.adiadas} adiadas, ${r.tarefas.atrasadas} não completas (atrasadas), ${r.tarefas.pendentes} pendentes.`,
    `CADÊNCIAS: ${r.cadencias.ativas} ativas, ${r.cadencias.leadsEmCadencia} leads em cadência, ${r.cadencias.emailsEnviados} e-mails enviados, ${r.cadencias.aberturas} aberturas.`,
    `TEMPERATURA: ${r.temperatura.quente} quentes, ${r.temperatura.morno} mornos, ${r.temperatura.frio} frios.`,
    "",
    "POR DONO (abertos / quentes / novos / tarefas pendentes):",
    ...r.porDono.map((x) => `- ${x.nome}: ${x.abertos} / ${x.quentes} / ${x.novos} / ${x.tarefasPendentes}`),
    ...(d.urlDoPainel ? ["", `Painel: ${d.urlDoPainel}`] : []),
  ].join("\n");
}
