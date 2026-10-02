import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Destino dos links de e-mail do Supabase Auth (confirmação de conta e
// recuperação de senha, fluxo PKCE): troca o `code` por sessão e redireciona.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  // só caminho relativo do próprio app (evita open redirect)
  const destino = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${destino}`)
  }
  return NextResponse.redirect(`${origin}/login?error=auth_callback`)
}
