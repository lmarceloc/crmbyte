"use client"

import { use } from "react"
import { Construtor } from "@/components/cadencias/construtor"

export default function CadenciaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <Construtor id={id} />
}
