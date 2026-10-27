import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  Flame,
  Funnel,
  ListChecks,
  Mail,
  MessageSquare,
  Paperclip,
  Plug,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Wallet,
  Waypoints,
} from 'lucide-react';

// Página pública de venda do CRM Byte (sem login).
// Liberada em PUBLIC_EXACT no src/middleware.ts.
//
// Preços da RD Station conferidos em rdstation.com/planos/crm em 27/10/2026.
// Ao atualizar, mude RD e CONFERIDO_EM juntos.

export const metadata: Metadata = {
  title: 'CRM Byte: o CRM completo por R$ 29 para o time inteiro',
  description:
    'Funil de vendas, cadências de e-mail, leads quentes, prospecção, IA e WhatsApp num só lugar. R$ 29 por mês, sem cobrança por usuário.',
};

const PRECO = 29;
const CONTATO = 'helloagenciabyte@gmail.com';
const CONFERIDO_EM = 'outubro de 2026';
/** Preço mensal por usuário (plano mensal). Pro exige no mínimo 4 usuários. */
const RD = { basic: 73, pro: 131, proMinimo: 4, basicAnual: 65.7, proAnual: 117.9, implementacao: 849 };

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: n % 1 ? 2 : 0 });

const custoRd = (usuarios: number) => ({
  basic: RD.basic * usuarios,
  pro: RD.pro * Math.max(usuarios, RD.proMinimo),
});

const FUNCOES: { icone: typeof Funnel; titulo: string; texto: string; itens: string[] }[] = [
  {
    icone: Funnel,
    titulo: 'Funil de vendas',
    texto: 'Seus negócios num quadro visual: arraste de etapa em etapa e veja o dinheiro em jogo.',
    itens: [
      'Vários funis com as etapas que você quiser',
      'Dias parado na etapa em cada cartão',
      'Temperatura e previsão de fechamento',
      'Produtos no negócio, com valor calculado sozinho',
      'Motivos de perda que viram relatório',
    ],
  },
  {
    icone: Target,
    titulo: 'Analisar Deals',
    texto: 'Um clique e o CRM diz em quais negócios mexer hoje, com nota de 0 a 100 e a próxima ação.',
    itens: [
      'Tempo sem contato, parado na etapa, fechamento próximo',
      'IA lê notas e mensagens e mede intenção de compra',
      'Aponta risco de perda antes que aconteça',
      'Pesos ajustáveis ao seu jeito de vender',
    ],
  },
  {
    icone: Waypoints,
    titulo: 'Cadências de e-mail',
    texto: 'Sequências de prospecção montadas num editor visual, que rodam sozinhas e param na hora certa.',
    itens: [
      'E-mail, espera, tarefa e condição (abriu, clicou, respondeu)',
      'Personalização com nome, empresa e cargo',
      'Para sozinha quando o lead responde ou o e-mail volta',
      'Envio espaçado, limite diário e janela de horário contra spam',
    ],
  },
  {
    icone: Mail,
    titulo: 'Envio pela caixa do vendedor',
    texto: 'O e-mail sai do endereço de quem vende, e a resposta cai na caixa dele.',
    itens: [
      'Login com a Microsoft 365, sem senha guardada',
      'Gmail e qualquer provedor por SMTP',
      'Cópia em "Enviados" e leitura de respostas',
      'Assinatura por caixa',
    ],
  },
  {
    icone: Flame,
    titulo: 'Leads quentes',
    texto: 'Quem abriu seu e-mail várias vezes aparece na hora, para você ligar enquanto o interesse está alto.',
    itens: ['Aviso de lead quente novo', 'Limite de aberturas definido por cadência', 'Resultado: com interesse, sem interesse, agendado'],
  },
  {
    icone: Paperclip,
    titulo: 'Proposta com rastreio',
    texto: 'Mande a proposta por link e saiba quando o cliente abriu, sem contar robôs de antivírus.',
    itens: ['PDF, Word, Excel, PowerPoint e imagens', 'Aviso de abertura no negócio'],
  },
  {
    icone: Search,
    titulo: 'Prospecção',
    texto: 'Encontre empresas e decisores e leve para o funil com um clique.',
    itens: [
      'Busca de empresas por segmento e cidade (Google Maps)',
      'Prospecção B2B com e-mail verificado do decisor',
      'Importação para o funil sem disparar nada sozinho',
    ],
  },
  {
    icone: Sparkles,
    titulo: 'IA que escreve o primeiro e-mail',
    texto: 'A IA lê o site do cliente, cruza com o que você vende e entrega um e-mail personalizado.',
    itens: ['Skills com o seu tom de voz e suas regras', 'Só promete o que você oferece'],
  },
  {
    icone: MessageSquare,
    titulo: 'WhatsApp oficial',
    texto: 'Caixa de entrada compartilhada na API oficial do WhatsApp Business.',
    itens: [
      'Vários atendentes no mesmo número',
      'Fotos, áudios e documentos',
      'Templates aprovados pela Meta',
      'Robô de atendimento com botões (beta)',
    ],
  },
  {
    icone: ListChecks,
    titulo: 'Tarefas e menções',
    texto: 'Ninguém esquece o próximo passo.',
    itens: ['Tarefas com prazo no contato e no negócio', 'Sininho de pendências', '@menções nas notas'],
  },
  {
    icone: BarChart3,
    titulo: 'Painel e relatórios',
    texto: 'Os números que importam, sem planilha.',
    itens: [
      'Painel organizável e disparos do dia',
      'Desempenho de cada cadência',
      'Negócios por empresa, com exportação em PDF',
      'Resumo semanal por e-mail toda segunda',
    ],
  },
  {
    icone: Plug,
    titulo: 'Integrações e API',
    texto: 'Traga contatos de qualquer lugar sem duplicar ninguém.',
    itens: ['API para n8n, formulários e outros sistemas', 'Reconhece o contato por e-mail, telefone ou LinkedIn'],
  },
];

const MOTIVOS: { icone: typeof Wallet; titulo: string; texto: string }[] = [
  {
    icone: Wallet,
    titulo: 'Preço fixo, time inteiro',
    texto: `${brl(PRECO)} por mês para a empresa. Contratou um vendedor novo? A conta não muda.`,
  },
  {
    icone: Waypoints,
    titulo: 'Prospecção e CRM juntos',
    texto: 'Achar o lead, mandar a cadência, ver quem abriu e fechar o negócio, tudo na mesma tela.',
  },
  {
    icone: Target,
    titulo: 'Diz o que fazer hoje',
    texto: 'Leads quentes e Analisar Deals mostram onde está a venda, em vez de só guardar dados.',
  },
  {
    icone: ShieldCheck,
    titulo: 'Seus dados protegidos',
    texto: 'Senhas e chaves cifradas, papéis de acesso e cada empresa enxergando só o que é dela.',
  },
];

const TIMES = [1, 5, 10];

function Secao({ id, titulo, subtitulo, children }: { id: string; titulo: string; subtitulo?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 px-4 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="mx-auto max-w-2xl space-y-3 text-center">
          <h2 className="text-foreground text-2xl font-bold tracking-tight sm:text-3xl">{titulo}</h2>
          {subtitulo && <p className="text-muted-foreground">{subtitulo}</p>}
        </header>
        {children}
      </div>
    </section>
  );
}

function BotaoPrincipal({ children }: { children: ReactNode }) {
  return (
    <Link
      href="/signup"
      className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold shadow-sm transition-colors"
    >
      {children}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

export default function ConhecaPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-border bg-background/85 sticky top-0 z-20 border-b backdrop-blur">
        <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <a href="#inicio" className="flex shrink-0 items-center gap-2">
            <span className="bg-primary text-primary-foreground flex h-8 w-8 items-center justify-center rounded-lg">
              <MessageSquare className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold">CRM Byte</span>
          </a>
          <div className="text-muted-foreground flex items-center gap-4 text-sm sm:gap-6">
            <a href="#funcoes" className="hover:text-foreground">Funções</a>
            <a href="#plano" className="hover:text-foreground">Plano</a>
            <a href="#por-que" className="hover:text-foreground hidden sm:inline">Por que a Byte</a>
            <Link href="/login" className="text-foreground hidden font-medium sm:inline">Entrar</Link>
          </div>
        </nav>
      </header>

      <main>
        <section id="inicio" className="scroll-mt-20 px-4 pt-16 pb-12 sm:pt-24">
          <div className="mx-auto max-w-3xl space-y-6 text-center">
            <p className="bg-primary-soft text-primary inline-block rounded-full px-3 py-1 text-xs font-semibold">
              {brl(PRECO)}/mês · sem cobrança por usuário
            </p>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              O CRM que acha o cliente, faz o follow-up e mostra onde está a venda
            </h1>
            <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
              Funil de vendas, cadências de e-mail, leads quentes, prospecção, IA e WhatsApp num só lugar. Um preço
              para o time inteiro.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <BotaoPrincipal>Começar agora</BotaoPrincipal>
              <a href="#plano" className="text-foreground rounded-lg px-5 py-3 text-sm font-semibold hover:underline">
                Comparar preços
              </a>
            </div>
          </div>
        </section>

        <Secao
          id="funcoes"
          titulo="Tudo o que o seu time comercial usa no dia a dia"
          subtitulo="Nenhum módulo extra para comprar: todas as funções abaixo estão no plano."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FUNCOES.map(({ icone: Icone, titulo, texto, itens }) => (
              <article key={titulo} className="border-border bg-card space-y-3 rounded-xl border p-5">
                <span className="bg-primary-soft text-primary flex h-10 w-10 items-center justify-center rounded-lg">
                  <Icone className="h-5 w-5" />
                </span>
                <h3 className="text-base font-semibold">{titulo}</h3>
                <p className="text-muted-foreground text-sm">{texto}</p>
                <ul className="space-y-1.5 text-sm">
                  {itens.map((i) => (
                    <li key={i} className="flex gap-2">
                      <Check className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                      <span>{i}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </Secao>

        <Secao
          id="plano"
          titulo="Um plano. Um preço. O time inteiro."
          subtitulo="Na maioria dos CRMs a conta cresce a cada vendedor contratado. Aqui, não."
        >
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
            <div className="border-primary bg-card space-y-5 rounded-2xl border-2 p-6 shadow-sm">
              <div className="space-y-1">
                <p className="text-primary text-sm font-semibold">CRM Byte</p>
                <p>
                  <span className="text-5xl font-bold">{brl(PRECO)}</span>
                  <span className="text-muted-foreground">/mês</span>
                </p>
                <p className="text-muted-foreground text-sm">Por empresa. Sem cobrança por usuário.</p>
              </div>
              <ul className="space-y-2 text-sm">
                {[
                  'Todas as funções desta página',
                  'Time inteiro no mesmo preço',
                  'Papéis de acesso: dono, admin, atendente e visualizador',
                  'Cadências, leads quentes e Analisar Deals',
                  'Prospecção, IA e WhatsApp oficial',
                ].map((i) => (
                  <li key={i} className="flex gap-2">
                    <Check className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                    <span>{i}</span>
                  </li>
                ))}
              </ul>
              <BotaoPrincipal>Começar agora</BotaoPrincipal>
              <p className="text-muted-foreground text-xs">
                Serviços de terceiros, como as conversas do WhatsApp cobradas pela Meta e créditos de prospecção, são
                pagos direto ao fornecedor.
              </p>
            </div>

            <div className="border-border bg-card space-y-4 rounded-2xl border p-6">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">Quanto custa por mês, conforme o tamanho do time</h3>
                <p className="text-muted-foreground text-sm">
                  Comparação com os planos do RD Station CRM, cobrados por usuário.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[460px] text-sm">
                  <thead>
                    <tr className="border-border text-muted-foreground border-b text-left">
                      <th className="py-2 pr-3 font-medium">Usuários</th>
                      <th className="text-primary py-2 pr-3 font-semibold">CRM Byte</th>
                      <th className="py-2 pr-3 font-medium">RD Basic</th>
                      <th className="py-2 font-medium">RD Pro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TIMES.map((n) => {
                      const rd = custoRd(n);
                      return (
                        <tr key={n} className="border-border border-b last:border-0">
                          <td className="py-3 pr-3 font-medium">
                            {n} {n === 1 ? 'usuário' : 'usuários'}
                          </td>
                          <td className="text-primary py-3 pr-3 font-bold">{brl(PRECO)}</td>
                          <td className="py-3 pr-3">{brl(rd.basic)}</td>
                          <td className="py-3">
                            {brl(rd.pro)}
                            {n < RD.proMinimo && <span className="text-muted-foreground"> *</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="bg-primary-soft rounded-xl p-4 text-sm">
                <p>
                  Com <strong>10 vendedores</strong>, o CRM Byte custa{' '}
                  <strong>{brl((custoRd(10).basic - PRECO) * 12)} a menos por ano</strong> que o RD Station CRM Basic.
                </p>
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Preços do RD Station CRM no plano mensal, por usuário: Basic {brl(RD.basic)} e Pro {brl(RD.pro)} (no
                anual, {brl(RD.basicAnual)} e {brl(RD.proAnual)}). * O Pro exige no mínimo {RD.proMinimo} usuários.
                Implementação opcional de {brl(RD.implementacao)}. Valores consultados em rdstation.com/planos/crm em{' '}
                {CONFERIDO_EM} e podem ter mudado. RD Station é marca de seus respectivos donos.
              </p>
            </div>
          </div>
        </Secao>

        <Secao id="por-que" titulo="Por que escolher o CRM da Byte">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MOTIVOS.map(({ icone: Icone, titulo, texto }) => (
              <article key={titulo} className="border-border bg-card space-y-3 rounded-xl border p-5">
                <span className="bg-primary-soft text-primary flex h-10 w-10 items-center justify-center rounded-lg">
                  <Icone className="h-5 w-5" />
                </span>
                <h3 className="font-semibold">{titulo}</h3>
                <p className="text-muted-foreground text-sm">{texto}</p>
              </article>
            ))}
          </div>

          <div className="border-border bg-card mx-auto max-w-3xl space-y-4 rounded-2xl border p-6 text-center sm:p-10">
            <div className="text-primary flex justify-center gap-3">
              <Users className="h-6 w-6" />
              <Building2 className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold sm:text-2xl">Coloque o time inteiro para vender por {brl(PRECO)}/mês</h3>
            <p className="text-muted-foreground">
              Crie a conta, convide o time por link e importe seus contatos. Ficou com dúvida? Fale com a gente em{' '}
              <a href={`mailto:${CONTATO}`} className="text-primary font-medium hover:underline">
                {CONTATO}
              </a>
              .
            </p>
            <BotaoPrincipal>Criar minha conta</BotaoPrincipal>
          </div>
        </Secao>
      </main>

      <footer className="border-border text-muted-foreground border-t px-4 py-8 text-center text-xs">
        <p>
          CRM Byte, da Agência Byte ·{' '}
          <Link href="/privacidade" className="hover:text-foreground underline">
            Política de privacidade
          </Link>
        </p>
      </footer>
    </div>
  );
}
