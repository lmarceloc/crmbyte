import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// O CRM é quase todo dinâmico (sessão por usuário, sem ISR/next/image),
// então não precisa de cache incremental (R2/KV).
export default defineCloudflareConfig({});
