/** Roda `fn` sobre cada item com no máximo `limite` chamadas ao mesmo tempo; o resultado segue a ordem dos itens. */
export async function mapComLimite<T, R>(
  itens: readonly T[],
  limite: number,
  fn: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  const resultados = new Array<R>(itens.length);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      resultados[i] = await fn(itens[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limite), itens.length) }, trabalhador));
  return resultados;
}
