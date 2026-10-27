import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// O Supabase pode devolver `/?code=...` quando o redirect do e-mail cai na
// raiz (Site URL). Encaminha para a rota que troca o código por sessão.
// Sem isso: logado vai para o painel; visitante, para a página de venda.
export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>
}) {
  const { code } = await searchParams
  if (code) redirect(`/auth/callback?code=${encodeURIComponent(code)}`)

  let logado = false
  try {
    const supabase = await createClient()
    logado = !!(await supabase.auth.getUser()).data.user
  } catch {
    // sem Supabase alcançável: o painel/login decide como antes
    logado = true
  }
  redirect(logado ? '/dashboard' : '/conheca')
}
