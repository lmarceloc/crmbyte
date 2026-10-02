"use client"

// Gráfico de fluxo (estilo "Outcomes" do HubSpot): barras proporcionais por
// etapa ligadas por faixas curvas. SVG puro, sem biblioteca.

export interface EtapaDoFunil {
  rotulo: string
  valor: number
  cor: string
}

export interface ResultadoDoFunil {
  rotulo: string
  valor: number
  cor: string
}

const W = 1000
const H = 300
const LARG_BARRA = 26
const TOPO = 20
const ALTURA_UTIL = 220

export function Funil({
  etapas,
  resultados,
}: {
  etapas: EtapaDoFunil[]
  resultados: ResultadoDoFunil[]
}) {
  const total = Math.max(1, etapas[0]?.valor ?? 0)
  const colunas = etapas.length + 1 // + coluna de resultados
  const passo = (W - LARG_BARRA) / (colunas - 1)
  const altura = (v: number) => (v <= 0 ? 0 : Math.max(4, (v / total) * ALTURA_UTIL))
  const x = (i: number) => i * passo

  // posição vertical: barras centralizadas na área útil
  const barras = etapas.map((e, i) => {
    const h = altura(e.valor)
    return { ...e, x: x(i), y: TOPO + (ALTURA_UTIL - h) / 2, h }
  })

  // coluna final: resultados empilhados com folga
  const somaRes = resultados.reduce((s, r) => s + altura(r.valor), 0)
  const folga = 8
  const alturasRes = resultados.map((r) => altura(r.valor))
  const inicioRes = TOPO + (ALTURA_UTIL - (somaRes + folga * (resultados.length - 1))) / 2
  const barrasRes = resultados.map((r, i) => ({
    ...r,
    x: x(colunas - 1),
    y: inicioRes + alturasRes.slice(0, i).reduce((s, h) => s + h + folga, 0),
    h: alturasRes[i],
  }))

  const faixa = (a: { x: number; y: number; h: number }, b: { x: number; y: number; h: number }) => {
    const x0 = a.x + LARG_BARRA
    const x1 = b.x
    const mx = (x0 + x1) / 2
    const h = Math.min(a.h, b.h)
    const ya = a.y + (a.h - h) / 2
    const yb = b.y + (b.h - h) / 2
    return `M${x0},${ya} C${mx},${ya} ${mx},${yb} ${x1},${yb} L${x1},${yb + h} C${mx},${yb + h} ${mx},${ya + h} ${x0},${ya + h} Z`
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Funil da cadência">
      {barras.slice(0, -1).map((b, i) => (
        <path key={`f${i}`} d={faixa(b, barras[i + 1])} fill={barras[i + 1].cor} opacity={0.28} />
      ))}
      {barras.map((b) => (
        <g key={b.rotulo}>
          <rect x={b.x} y={b.y} width={LARG_BARRA} height={Math.max(b.h, 2)} rx={3} fill={b.cor} />
          <text x={b.x + LARG_BARRA / 2} y={b.y + b.h / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={600} fill="#111">
            {b.h >= 16 ? b.valor : ""}
          </text>
          <text x={b.x + LARG_BARRA / 2} y={TOPO + ALTURA_UTIL + 22} textAnchor="middle" fontSize={13} className="fill-muted-foreground">
            {b.rotulo}
          </text>
          <text x={b.x + LARG_BARRA / 2} y={TOPO + ALTURA_UTIL + 40} textAnchor="middle" fontSize={13} fontWeight={600} className="fill-foreground">
            {b.valor}
          </text>
        </g>
      ))}
      {barrasRes.map((b) => (
        <g key={b.rotulo}>
          <rect x={b.x} y={b.y} width={LARG_BARRA} height={Math.max(b.h, 2)} rx={3} fill={b.cor} />
          <text x={b.x - 8} y={b.y + b.h / 2 + 4} textAnchor="end" fontSize={12} className="fill-foreground">
            {b.rotulo}: <tspan fontWeight={600}>{b.valor}</tspan>
          </text>
        </g>
      ))}
      <text x={x(colunas - 1) + LARG_BARRA / 2} y={TOPO + ALTURA_UTIL + 22} textAnchor="middle" fontSize={13} className="fill-muted-foreground">
        Resultado
      </text>
      <text x={x(colunas - 1) + LARG_BARRA / 2} y={TOPO + ALTURA_UTIL + 40} textAnchor="middle" fontSize={11} className="fill-muted-foreground">
        (marcado à mão)
      </text>
    </svg>
  )
}
