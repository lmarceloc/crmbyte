/**
 * Lê variável de ambiente tolerando erros comuns ao colar no painel da
 * hospedagem: espaços/quebra de linha nas pontas e aspas ao redor.
 */
export function envLimpa(nome: string): string {
  return (process.env[nome] ?? '').trim().replace(/^["']|["']$/g, '').trim()
}
