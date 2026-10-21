import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { config } from '@/middleware';
import { expect, test } from 'vitest';
const m = (url: string) => unstable_doesMiddlewareMatch({ config, url });
test('middleware ignora só as rotas de máquina', () => {
  for (const u of [
    '/api/cadencias/worker',
    '/api/prospecting/worker',
    '/api/automations/cron',
    '/api/flows/cron',
    '/api/whatsapp/webhook',
    '/api/cadencias/pixel/abc',
    '/api/cadencias/click/abc',
    '/api/cadencias/descadastro/abc',
  ])
    expect(m(u), u).toBe(false);
  for (const u of [
    '/',
    '/inbox',
    '/login',
    '/api/cadencias',
    '/api/cadencias/123',
    '/api/whatsapp/send',
    '/api/automations',
    '/api/automations/engine',
    '/api/flows/123',
    '/p/tok',
    '/api/prospecting',
  ])
    expect(m(u), u).toBe(true);
});
