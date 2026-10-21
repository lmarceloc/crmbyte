// Entrada do Worker na Cloudflare: reaproveita o handler gerado pelo
// OpenNext (`.open-next/worker.js`) e adiciona os Cron Triggers que antes
// eram um crontab externo batendo nas rotas de worker com o segredo.
// Gerado no build (`opennextjs-cloudflare build`); fora do tsconfig.
import { default as handler } from './.open-next/worker.js';

type Env = Record<string, string | undefined>;

// Rotas disparadas por cron (ver wrangler.jsonc → triggers.crons).
const JOBS: Record<string, { path: string; method: 'GET' | 'POST' }[]> = {
  '* * * * *': [
    { path: '/api/cadencias/worker', method: 'GET' },
    { path: '/api/prospecting/worker', method: 'GET' },
    { path: '/api/automations/cron', method: 'GET' },
  ],
  '*/5 * * * *': [{ path: '/api/flows/cron', method: 'GET' }],
};

export default {
  fetch: handler.fetch,

  async scheduled(
    controller: { cron: string },
    env: Env,
    ctx: { waitUntil(p: Promise<unknown>): void }
  ) {
    const base = env.NEXT_PUBLIC_SITE_URL || 'https://crm.agenciabyte.com';
    // /api/cadencias e /api/prospecting aceitam CRON_SECRET ou
    // AUTOMATION_CRON_SECRET; /api/automations e /api/flows só o segundo.
    const cronSecret = env.CRON_SECRET || env.AUTOMATION_CRON_SECRET || '';
    const automationSecret =
      env.AUTOMATION_CRON_SECRET || env.CRON_SECRET || '';

    for (const job of JOBS[controller.cron] ?? []) {
      const req = new Request(new URL(job.path, base), {
        method: job.method,
        headers: {
          authorization: `Bearer ${cronSecret}`,
          'x-cron-secret': automationSecret,
        },
      });
      ctx.waitUntil(
        handler
          .fetch(req, env, ctx)
          .then(async (res: Response) => {
            if (!res.ok)
              console.error(
                `[cron] ${job.path} → ${res.status}`,
                await res.text()
              );
          })
          .catch((e: unknown) => console.error(`[cron] ${job.path}`, e))
      );
    }
  },
};
