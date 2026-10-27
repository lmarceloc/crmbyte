# Assinatura do CRM pela AbacatePay

O plano do CRM custa **R$ 29/mês por conta**, sem cobrança por usuário, e é pago pela AbacatePay
(API v2, assinatura mensal no cartão).

## Como funciona
1. O dono ou um admin abre **Configurações → Plano** e clica em **Assinar por R$ 29,00/mês**.
2. O servidor garante o produto mensal no catálogo da AbacatePay (`externalId` `crm-byte-mensal`,
   criado sozinho no primeiro uso). Depois cria o checkout de assinatura com o id da conta em
   `metadata.account_id` e no começo do `externalId`.
3. O cliente paga na página da AbacatePay e volta para `/assinatura?assinatura=ok`. A tela fica
   conferindo o status até o webhook chegar e então leva para Configurações → Plano.
4. O webhook (`POST /api/abacatepay/webhook`) atualiza `conta_assinatura`:
   - **Ativa:** `subscription.completed`, `subscription.renewed` ou `subscription.trial_started`.
   - **Pagamento recusado:** `subscription.payment_failed`. A AbacatePay tenta cobrar de novo.
   - **Cancelada:** `subscription.cancelled`.
5. Depois do primeiro pagamento aparece **Gerenciar assinatura**. Esse botão abre o portal do cliente
   da AbacatePay, onde o assinante troca o cartão, vê os pagamentos e cancela.

## 7 dias grátis e bloqueio
- **Conta nova:** usa o CRM de graça por 7 dias a partir da criação (`conta_assinatura.teste_ate`,
  preenchido por um trigger em `accounts`).
- **Contas que já existiam:** ganham 7 dias a partir do dia em que a migration 052 rodar.
- **Quando o teste vence sem assinatura**, o painel inteiro manda para `/assinatura`. Lá o dono ou o
  admin assina, e os outros membros veem o aviso para pedir a eles. **Nada é apagado.**
- **Cadências e prospecção de conta bloqueada ficam paradas:** nenhum e-mail sai e nenhum crédito é
  gasto. Elas voltam sozinhas quando a assinatura é ativada.
- **Pagamento recusado continua liberado** enquanto a AbacatePay tenta cobrar de novo. Se ela
  desistir, chega `subscription.cancelled` e a conta é bloqueada.
- **Conta isenta** (ex.: a própria Byte) nunca é bloqueada. Para isentar, rode no SQL Editor:
  ```sql
  UPDATE conta_assinatura SET isenta = TRUE WHERE account_id = '<id da conta>';
  ```
  Para achar o id: `select id, name, created_at from accounts order by created_at;`
- **Limite conhecido:** o bloqueio vale para as telas e os workers. As rotas de API e as leituras
  diretas do Supabase não conferem a assinatura.

## Segurança
- A chave da API fica só no servidor (`ABACATEPAY_API_KEY`) e nunca vai ao navegador nem ao banco.
- O webhook só é aceito com o segredo do webhook, em um destes dois formatos:
  - `?webhookSecret=` na URL (webhooks antigos);
  - assinatura Standard Webhooks (`webhook-id`, `webhook-timestamp`, `webhook-signature`).

  Sem `ABACATEPAY_WEBHOOK_SECRET` configurado, todo webhook é recusado.
- O estado da assinatura **não é lido do corpo do webhook**. O servidor confere a assinatura na API
  (`/subscriptions/get`) antes de gravar.
- Entregas repetidas da mesma notificação são ignoradas (`abacatepay_webhook_eventos`).

## Configuração
1. **Migrations:** rode `051_assinatura_abacatepay.sql` e depois `052_assinatura_teste_gratis.sql` no SQL
   Editor do Supabase **antes** de subir o código.
2. **Chave da API:** no painel da AbacatePay, crie uma chave com permissão para produtos (ler e
   criar), assinaturas (criar e ler) e portal do cliente. As permissões não mudam depois de criadas.
   Use a chave `abc_dev_...` para testar e a de produção depois.
3. **Webhook:** no painel da AbacatePay, cadastre:
   - URL `https://crm.agenciabyte.com/api/abacatepay/webhook`;
   - eventos `subscription.completed`, `subscription.renewed`, `subscription.trial_started`,
     `subscription.payment_failed` e `subscription.cancelled`;
   - um segredo aleatório de 32 caracteres ou mais.
4. **Variáveis no Cloudflare** (Settings → Variables and Secrets, tipo Secret):
   `ABACATEPAY_API_KEY` e `ABACATEPAY_WEBHOOK_SECRET`. Faça um novo deploy depois.

## Testar (modo de desenvolvedor)
Com a chave `abc_dev_...`, assine pela tela e pague com o cartão **4242 4242 4242 4242**, qualquer
data futura e qualquer CVV. A assinatura deve aparecer como **Ativa** em Configurações → Plano.
Para ir para produção, a conta da AbacatePay precisa de CNPJ, e a análise leva até 3 dias úteis.
Depois troque a chave e o webhook pelos de produção.

## Arquivos
- `src/lib/assinatura/abacatepay.ts`: cliente da API (produto, checkout, assinatura e portal).
- `src/lib/assinatura/webhook.ts`: autenticação do webhook e leitura do evento (com testes).
- `src/app/api/assinatura/route.ts`: estado (GET) e criação do checkout (POST, admin+).
- `src/app/api/assinatura/portal/route.ts`: link do portal do cliente (admin+).
- `src/app/api/abacatepay/webhook/route.ts`: webhook.
- `src/components/settings/plano-settings.tsx`: tela Configurações → Plano.
- `src/lib/assinatura/acesso.ts`: regra de acesso (teste, assinatura, isenção), com testes.
- `src/app/assinatura/`: página de bloqueio com o botão de assinar.
- `src/app/(dashboard)/layout.tsx`: confere o acesso antes de abrir o painel.
