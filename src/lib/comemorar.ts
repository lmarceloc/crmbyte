// Confete na tela quando um negócio é ganho. Só no navegador; carrega a biblioteca
// sob demanda (não pesa no carregamento da página) e respeita "reduzir movimento".

export async function comemorar(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { default: confetti } = await import("canvas-confetti");
    const base = { disableForReducedMotion: true, zIndex: 9999, ticks: 220 };
    // dois canhões, um de cada lado, e uma chuva no meio
    confetti({ ...base, particleCount: 90, angle: 60, spread: 70, origin: { x: 0, y: 0.75 } });
    confetti({ ...base, particleCount: 90, angle: 120, spread: 70, origin: { x: 1, y: 0.75 } });
    setTimeout(() => confetti({ ...base, particleCount: 140, spread: 120, startVelocity: 35, origin: { x: 0.5, y: 0.35 } }), 250);
  } catch {
    // sem confete não quebra nada
  }
}
