import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { envLimpa } from '@/lib/supabase/service-env'

// Lazy, shared service-role client for automation engine work.
// Mirrors the pattern used by the webhook handler
// (src/app/api/whatsapp/webhook/route.ts).
let _adminClient: SupabaseClient | null = null

export function supabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      envLimpa('NEXT_PUBLIC_SUPABASE_URL'),
      envLimpa('SUPABASE_SERVICE_ROLE_KEY'),
    )
  }
  return _adminClient
}
