import { redirect } from 'next/navigation'

// O Supabase pode devolver `/?code=...` quando o redirect do e-mail cai na
// raiz (Site URL). Encaminha para a rota que troca o código por sessão.
export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>
}) {
  const { code } = await searchParams
  if (code) redirect(`/auth/callback?code=${encodeURIComponent(code)}`)
  redirect('/dashboard')
}
