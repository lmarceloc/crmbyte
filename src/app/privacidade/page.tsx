import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Página pública (sem login) exigida pela Meta para publicar o app do
// WhatsApp: a URL vai em Configurações do app → Básico → "URL da Política
// de Privacidade" e também serve como instrução de exclusão de dados.
// Liberada em PUBLIC_EXACT no src/middleware.ts.

export const metadata: Metadata = {
  title: 'Política de privacidade',
  description: 'Como o CRM Byte, da Agência Byte, trata dados pessoais.',
};

const CONTATO = 'helloagenciabyte@gmail.com';
const ATUALIZADA_EM = '27 de outubro de 2026';

function Secao({
  id,
  titulo,
  children,
}: {
  id?: string;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8 space-y-3">
      <h2 className="text-foreground text-lg font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

export default function PrivacidadePage() {
  const email = (
    <a
      href={`mailto:${CONTATO}`}
      className="text-primary font-medium hover:underline"
    >
      {CONTATO}
    </a>
  );

  return (
    <main className="bg-background text-muted-foreground min-h-screen px-4 py-12">
      <article className="mx-auto max-w-2xl space-y-8 text-sm leading-relaxed">
        <header className="space-y-2">
          <p className="text-primary text-xs font-medium tracking-wide uppercase">
            CRM Byte
          </p>
          <h1 className="text-foreground text-2xl font-bold">
            Política de privacidade
          </h1>
          <p>Última atualização: {ATUALIZADA_EM}.</p>
        </header>

        <p>
          O CRM Byte é o sistema de relacionamento com clientes operado pela{' '}
          <strong className="text-foreground">Agência Byte</strong>, disponível
          em crm.agenciabyte.com. Esta política explica quais dados pessoais o
          sistema trata, para quê, com quem eles são compartilhados e como pedir
          acesso, correção ou exclusão, nos termos da Lei Geral de Proteção de
          Dados (Lei nº 13.709/2018, LGPD).
        </p>

        <Secao titulo="1. Papéis">
          <p>
            Em relação aos dados de quem usa o sistema (usuários e equipes), a
            Agência Byte é a controladora. Em relação aos dados de contatos,
            empresas e conversas que cada empresa cliente cadastra ou recebe no
            CRM, a empresa cliente é a controladora e a Agência Byte atua como
            operadora, tratando esses dados apenas para prestar o serviço.
          </p>
        </Secao>

        <Secao titulo="2. Dados que tratamos">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-foreground">Conta de usuário:</strong>{' '}
              nome, e-mail, senha (guardada de forma cifrada pelo provedor de
              autenticação), conta e função na equipe.
            </li>
            <li>
              <strong className="text-foreground">Contatos e negócios:</strong>{' '}
              nome, telefone, e-mail, empresa, cargo, anotações, tarefas,
              etiquetas e o histórico de negociações cadastrados pelos usuários
              ou importados por eles.
            </li>
            <li>
              <strong className="text-foreground">WhatsApp:</strong> número de
              telefone, nome de perfil, conteúdo das mensagens enviadas e
              recebidas, mídias e status de entrega e leitura, recebidos pela
              API oficial do WhatsApp Business (Meta).
            </li>
            <li>
              <strong className="text-foreground">E-mail:</strong> mensagens
              enviadas pelas cadências, respostas recebidas nas caixas
              conectadas e registros de abertura e de clique, além de pedidos de
              descadastro.
            </li>
            <li>
              <strong className="text-foreground">Dados técnicos:</strong>{' '}
              registros de acesso e de erro (endereço IP, data e hora,
              navegador) necessários para segurança e operação.
            </li>
          </ul>
        </Secao>

        <Secao titulo="3. Para que usamos">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Prestar o serviço de CRM: organizar contatos, funis, tarefas e
              atendimento.
            </li>
            <li>
              Enviar e receber mensagens de WhatsApp e e-mail em nome da empresa
              cliente, inclusive por fluxos e respostas automáticas configurados
              por ela.
            </li>
            <li>
              Gerar resumos e sugestões com inteligência artificial, quando o
              recurso é usado.
            </li>
            <li>
              Manter a segurança, prevenir abusos e cumprir obrigações legais.
            </li>
          </ul>
          <p>
            As bases legais são a execução de contrato, o legítimo interesse, o
            cumprimento de obrigação legal e, quando aplicável, o consentimento.
            Não vendemos dados pessoais e não os usamos para publicidade.
          </p>
        </Secao>

        <Secao titulo="4. Com quem compartilhamos">
          <p>
            Somente com fornecedores necessários para o funcionamento do
            serviço:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Meta Platforms (API do WhatsApp Business), para enviar e receber
              mensagens;
            </li>
            <li>Supabase, para banco de dados, autenticação e arquivos;</li>
            <li>Cloudflare, para hospedagem e entrega do sistema;</li>
            <li>
              provedores de e-mail conectados pela empresa cliente (por exemplo,
              Microsoft) e o servidor de envio da Agência Byte;
            </li>
            <li>
              provedores de inteligência artificial e de pesquisa na web
              (OpenRouter e Firecrawl), apenas quando esses recursos são usados.
            </li>
          </ul>
          <p>
            Alguns desses fornecedores processam dados fora do Brasil, com as
            salvaguardas previstas na LGPD. Dados também podem ser fornecidos a
            autoridades quando a lei exigir.
          </p>
        </Secao>

        <Secao titulo="5. Por quanto tempo guardamos">
          <p>
            Os dados ficam armazenados enquanto a conta da empresa cliente
            estiver ativa ou enquanto forem necessários para as finalidades
            acima. Depois disso são excluídos, salvo quando a lei exigir
            guardá-los por mais tempo.
          </p>
        </Secao>

        <Secao titulo="6. Segurança">
          <p>
            O acesso é protegido por login e separado por conta. Tokens de
            integração, como o do WhatsApp, são guardados cifrados, e as
            notificações recebidas da Meta têm a assinatura conferida antes de
            serem processadas.
          </p>
        </Secao>

        <Secao id="exclusao" titulo="7. Seus direitos e exclusão de dados">
          <p>
            Você pode pedir confirmação de tratamento, acesso, correção,
            anonimização, portabilidade ou exclusão dos seus dados, e revogar
            consentimentos.
          </p>
          <p>
            <strong className="text-foreground">Para excluir seus dados</strong>{' '}
            (inclusive os recebidos pelo WhatsApp), envie um e-mail para {email}{' '}
            com o assunto &quot;Exclusão de dados&quot;, informando o número de
            telefone ou e-mail usado. Respondemos em até 15 dias. Se os seus
            dados foram cadastrados por uma empresa cliente do CRM Byte, também
            podemos encaminhar o pedido a ela.
          </p>
          <p>
            Para deixar de receber mensagens, peça pelo próprio WhatsApp ou pelo
            e-mail acima, ou use o link de descadastro presente nos e-mails.
          </p>
        </Secao>

        <Secao titulo="8. Contato e alterações">
          <p>
            Dúvidas sobre esta política ou sobre o tratamento de dados: {email}.
            Esta política pode ser atualizada; a data no topo indica a versão em
            vigor.
          </p>
        </Secao>

        <footer className="border-border border-t pt-6 text-xs">
          <a
            href="https://agenciabyte.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground hover:text-primary font-medium"
          >
            Agência Byte
          </a>
        </footer>
      </article>
    </main>
  );
}
