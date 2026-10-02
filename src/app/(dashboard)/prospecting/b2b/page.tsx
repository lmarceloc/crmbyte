"use client"

import { RequireRole } from "@/components/auth/require-role"
import { ProspectingPanel } from "@/components/prospecting/prospecting-panel"

export default function Page() {
  return (
    <RequireRole min="admin">
      <ProspectingPanel kind="b2b" />
    </RequireRole>
  )
}
