// Teste de ponta a ponta do link rastreável de anexo (/p/<token>).
//
// Precisa do servidor rodando (npm run dev, ou BASE_URL apontando para um
// deploy) e das variáveis do .env.local: NEXT_PUBLIC_SUPABASE_URL e
// SUPABASE_SERVICE_ROLE_KEY. O servidor testado tem que usar o MESMO projeto
// Supabase do .env.local.
//
//   npm run dev                       # em outro terminal
//   node scripts/e2e-anexo.mjs
//   BASE_URL=https://seu-crm.vercel.app node scripts/e2e-anexo.mjs
//
// Usa um negócio que já existe como "pai" (só lê), cria um anexo de teste
// (arquivo no bucket + linha em deal_attachments) e, no fim — passando ou
// falhando —, apaga o que criou. Sobras de execuções interrompidas (nome
// começando com E2E-TESTE-) são varridas no início.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  ''
);
const BUCKET = 'deal-attachments';
const PREFIXO = 'E2E-TESTE-';

const UA_NAVEGADOR =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const UA_ROBO_WHATSAPP = 'WhatsApp/2.23.20.0 A';
const UA_ROBO_SAFELINKS = 'Mozilla/5.0 (compatible; Microsoft-SafeLinks/1.0)';

// PDF válido mínimo (uma página em branco).
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n' +
    'trailer<</Root 1 0 R>>\n%%EOF\n'
);

// ---------------------------------------------------------------- ambiente
function carregarEnvLocal() {
  try {
    for (const linha of readFileSync(
      new URL('../.env.local', import.meta.url),
      'utf8'
    ).split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined)
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  } catch {
    // sem .env.local: vale o que já estiver no ambiente
  }
}
carregarEnvLocal();

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY (.env.local ou ambiente).'
  );
  process.exit(2);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ------------------------------------------------------------------ helpers
let passou = 0;
let falhou = 0;

function confere(descricao, condicao, detalhe) {
  if (condicao) {
    passou++;
    console.log(`  ok   ${descricao}`);
  } else {
    falhou++;
    console.log(
      `  FALHA ${descricao}${detalhe !== undefined ? `  → ${detalhe}` : ''}`
    );
  }
}

const passo = (titulo) => console.log(`\n${titulo}`);

const get = (token, ua) =>
  fetch(`${BASE_URL}/p/${token}`, {
    headers: { 'User-Agent': ua },
    redirect: 'manual',
  });

const post = (token, ua) =>
  fetch(`${BASE_URL}/p/${token}`, {
    method: 'POST',
    headers: { 'User-Agent': ua },
    redirect: 'manual',
  });

async function estado(id) {
  const { data: anexo, error } = await db
    .from('deal_attachments')
    .select('open_count,last_opened_at,share_token,share_enabled')
    .eq('id', id)
    .single();
  if (error) throw new Error(`ler anexo: ${error.message}`);
  const { count, error: e2 } = await db
    .from('deal_attachment_opens')
    .select('id', { count: 'exact', head: true })
    .eq('attachment_id', id);
  if (e2) throw new Error(`ler aberturas: ${e2.message}`);
  return { ...anexo, aberturas: count ?? 0 };
}

async function varrerSobras() {
  const { data } = await db
    .from('deal_attachments')
    .select('id,file_path')
    .like('file_name', `${PREFIXO}%`);
  for (const a of data ?? []) {
    await db.storage.from(BUCKET).remove([a.file_path]);
    await db.from('deal_attachments').delete().eq('id', a.id);
  }
  if (data?.length)
    console.log(`(varridas ${data.length} sobra(s) de execução anterior)`);
}

// --------------------------------------------------------------------- teste
let anexoId = null;
let caminho = null;

async function preparar() {
  passo('Preparação');
  const resp = await fetch(`${BASE_URL}/p/${'0'.repeat(32)}`, {
    redirect: 'manual',
  }).catch((e) => e);
  if (resp instanceof Error)
    throw new Error(
      `servidor fora do ar em ${BASE_URL} (${resp.cause?.code ?? resp.message})`
    );
  confere(
    `servidor responde em ${BASE_URL}`,
    resp.status === 404,
    `status ${resp.status}`
  );

  await varrerSobras();

  const { data: negocio, error } = await db
    .from('deals')
    .select('id,account_id')
    .limit(1)
    .maybeSingle();
  if (error || !negocio)
    throw new Error(
      `nenhum negócio para usar como pai (${error?.message ?? 'tabela vazia'})`
    );

  caminho = `account-${negocio.account_id}/e2e-${Date.now()}.pdf`;
  const up = await db.storage
    .from(BUCKET)
    .upload(caminho, PDF, { contentType: 'application/pdf' });
  if (up.error) throw new Error(`upload no bucket: ${up.error.message}`);

  const { data: anexo, error: eIns } = await db
    .from('deal_attachments')
    .insert({
      account_id: negocio.account_id,
      deal_id: negocio.id,
      file_path: caminho,
      file_name: `${PREFIXO}${Date.now()}.pdf`,
      mime_type: 'application/pdf',
      size_bytes: PDF.length,
    })
    .select('id,share_token')
    .single();
  if (eIns) throw new Error(`criar anexo: ${eIns.message}`);
  anexoId = anexo.id;
  console.log(`  anexo de teste criado (${anexoId})`);
  return anexo.share_token;
}

async function rodar() {
  let token = await preparar();

  passo('1. Segurança do arquivo');
  const publica = await fetch(
    `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${caminho}`
  );
  confere(
    'URL pública do bucket NÃO entrega o arquivo (bucket privado)',
    !publica.ok,
    `status ${publica.status}`
  );

  passo('2. Robô só olhando o link (GET) — não conta');
  for (const [nome, ua] of [
    ['curl', 'curl/8.4.0'],
    ['WhatsApp', UA_ROBO_WHATSAPP],
    ['Safe Links', UA_ROBO_SAFELINKS],
  ]) {
    const r = await get(token, ua);
    const html = await r.text();
    confere(
      `GET como ${nome}: 200 com página de abertura`,
      r.status === 200 && html.includes('<form'),
      `status ${r.status}`
    );
  }
  let s = await estado(anexoId);
  confere(
    'nenhuma abertura registrada pelos GETs',
    s.aberturas === 0 && s.open_count === 0,
    JSON.stringify(s)
  );

  passo('3. Robô que chega a enviar o POST — redireciona mas não conta');
  for (const [nome, ua] of [
    ['WhatsApp', UA_ROBO_WHATSAPP],
    ['Safe Links', UA_ROBO_SAFELINKS],
    ['sem user-agent', ''],
  ]) {
    const r = await post(token, ua);
    confere(`POST como ${nome}: 303`, r.status === 303, `status ${r.status}`);
  }
  s = await estado(anexoId);
  confere(
    'continua com 0 aberturas',
    s.aberturas === 0 && s.open_count === 0,
    JSON.stringify(s)
  );

  passo('4. Navegador de verdade — conta e entrega o PDF');
  const pagina = await get(token, UA_NAVEGADOR);
  const html = await pagina.text();
  confere(
    'GET do navegador: página com auto-envio do formulário',
    html.includes('document.forms[0].submit()')
  );
  const r = await post(token, UA_NAVEGADOR);
  const destino = r.headers.get('location') ?? '';
  confere(
    'POST do navegador: 303 para URL assinada',
    r.status === 303 && destino.includes('/object/sign/'),
    `status ${r.status} ${destino.slice(0, 80)}`
  );
  const arquivo = destino ? await fetch(destino) : null;
  const corpo = arquivo
    ? Buffer.from(await arquivo.arrayBuffer())
    : Buffer.alloc(0);
  confere(
    'URL assinada devolve o PDF',
    arquivo?.status === 200 && corpo.subarray(0, 5).toString() === '%PDF-',
    `status ${arquivo?.status}`
  );
  confere(
    'tipo do arquivo é application/pdf',
    (arquivo?.headers.get('content-type') ?? '').includes('pdf'),
    arquivo?.headers.get('content-type')
  );
  s = await estado(anexoId);
  confere(
    '1 abertura registrada e open_count = 1',
    s.aberturas === 1 && s.open_count === 1,
    JSON.stringify(s)
  );
  confere('last_opened_at preenchido', Boolean(s.last_opened_at));

  passo('5. Segundo clique no mesmo minuto — conta como um só');
  const r2 = await post(token, UA_NAVEGADOR);
  confere(
    'POST repetido ainda entrega o arquivo (303)',
    r2.status === 303,
    `status ${r2.status}`
  );
  s = await estado(anexoId);
  confere(
    'continua com 1 abertura',
    s.aberturas === 1 && s.open_count === 1,
    JSON.stringify(s)
  );

  passo('6. Depois da janela de 1 minuto — conta de novo');
  const { error: eBack } = await db
    .from('deal_attachment_opens')
    .update({ created_at: new Date(Date.now() - 2 * 60_000).toISOString() })
    .eq('attachment_id', anexoId);
  if (eBack) throw new Error(`retroceder abertura: ${eBack.message}`);
  const r3 = await post(token, UA_NAVEGADOR);
  confere('POST: 303', r3.status === 303, `status ${r3.status}`);
  s = await estado(anexoId);
  confere(
    '2 aberturas e open_count = 2',
    s.aberturas === 2 && s.open_count === 2,
    JSON.stringify(s)
  );

  passo('7. Tokens inválidos');
  for (const [nome, t] of [
    ['formato inválido', 'abc'],
    ['32 hex inexistente', 'f'.repeat(32)],
    ['com maiúsculas', token.toUpperCase()],
  ]) {
    const g = await get(t, UA_NAVEGADOR);
    const p = await post(t, UA_NAVEGADOR);
    confere(
      `${nome}: GET e POST dão 404`,
      g.status === 404 && p.status === 404,
      `GET ${g.status} POST ${p.status}`
    );
  }

  passo('8. Link desativado');
  await db
    .from('deal_attachments')
    .update({ share_enabled: false })
    .eq('id', anexoId);
  const gOff = await get(token, UA_NAVEGADOR);
  const pOff = await post(token, UA_NAVEGADOR);
  confere(
    'GET e POST dão 404',
    gOff.status === 404 && pOff.status === 404,
    `GET ${gOff.status} POST ${pOff.status}`
  );
  s = await estado(anexoId);
  confere(
    'contadores intactos (2)',
    s.aberturas === 2 && s.open_count === 2,
    JSON.stringify(s)
  );

  passo('9. Reativar e gerar novo link');
  await db
    .from('deal_attachments')
    .update({ share_enabled: true })
    .eq('id', anexoId);
  const gOn = await get(token, UA_NAVEGADOR);
  confere(
    'reativado: GET volta a dar 200',
    gOn.status === 200,
    `status ${gOn.status}`
  );
  const novo = crypto.randomUUID().replace(/-/g, '');
  await db
    .from('deal_attachments')
    .update({ share_token: novo, share_enabled: true })
    .eq('id', anexoId);
  const gVelho = await get(token, UA_NAVEGADOR);
  const gNovo = await get(novo, UA_NAVEGADOR);
  confere(
    'token antigo dá 404',
    gVelho.status === 404,
    `status ${gVelho.status}`
  );
  confere('token novo dá 200', gNovo.status === 200, `status ${gNovo.status}`);
  token = novo;

  passo('10. Excluir o anexo');
  await db.storage.from(BUCKET).remove([caminho]);
  const { error: eDel } = await db
    .from('deal_attachments')
    .delete()
    .eq('id', anexoId);
  confere('linha apagada', !eDel, eDel?.message);
  const gDel = await get(token, UA_NAVEGADOR);
  confere(
    'link do anexo excluído dá 404',
    gDel.status === 404,
    `status ${gDel.status}`
  );
  const { count } = await db
    .from('deal_attachment_opens')
    .select('id', { count: 'exact', head: true })
    .eq('attachment_id', anexoId);
  confere('aberturas apagadas junto (cascade)', count === 0, `count ${count}`);
  anexoId = null;
  caminho = null;
}

async function limpar() {
  if (!anexoId && !caminho) return;
  try {
    if (caminho) await db.storage.from(BUCKET).remove([caminho]);
    if (anexoId) await db.from('deal_attachments').delete().eq('id', anexoId);
    console.log('\n(limpeza final feita)');
  } catch (e) {
    console.error(
      `\nATENÇÃO: não consegui limpar o anexo de teste ${anexoId} (${caminho}): ${e.message}`
    );
  }
}

try {
  await rodar();
} catch (e) {
  falhou++;
  console.error(`\nERRO: ${e.message}`);
} finally {
  await limpar();
}

console.log(`\n${passou} ok, ${falhou} falha(s)`);
process.exit(falhou ? 1 : 0);
