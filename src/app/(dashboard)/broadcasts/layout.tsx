import { redirect } from "next/navigation";
import { RECURSOS } from "@/lib/features";

// Recurso escondido (ver src/lib/features.ts): quem abrir a URL volta ao painel.
export default function Layout({ children }: { children: React.ReactNode }) {
  if (!RECURSOS.transmissoes) redirect("/dashboard");
  return <>{children}</>;
}
