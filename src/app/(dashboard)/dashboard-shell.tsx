"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { DetailPanelProvider } from "@/components/detail/detail-panel-provider";
import { ConfirmarExclusaoProvider } from "@/components/ui/confirmar-exclusao";
import { BannerTesteGratis } from "@/components/layout/banner-teste-gratis";

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

function DashboardShellInner({ children, testeAte }: { children: React.ReactNode; testeAte: string | null }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Sidebar drawer state — only used on mobile. On lg+ the sidebar is
  // always visible and this stays at `false` (ignored by the component).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onOpenSidebar={() => setSidebarOpen(true)} />
        {testeAte && <BannerTesteGratis testeAte={testeAte} />}
        {/* Thinner horizontal padding on mobile so cards have room to breathe. */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

/** `testeAte`: fim do teste grátis, só para conta em teste (sem assinatura e não isenta). */
export function DashboardShell({ children, testeAte = null }: { children: React.ReactNode; testeAte?: string | null }) {
  return (
    <AuthProvider>
      <ConfirmarExclusaoProvider>
        <DetailPanelProvider>
          <DashboardShellInner testeAte={testeAte}>{children}</DashboardShellInner>
        </DetailPanelProvider>
      </ConfirmarExclusaoProvider>
    </AuthProvider>
  );
}
