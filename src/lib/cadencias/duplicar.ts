/** Nome da cópia: "<nome>_copia", cortando o original para caber no limite de 160. */
export function nomeDaCopia(nome: string, limite = 160): string {
  const sufixo = "_copia";
  return `${nome.trim().slice(0, limite - sufixo.length).trimEnd()}${sufixo}`;
}
