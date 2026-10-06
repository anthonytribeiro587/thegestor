"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({ children, role = "Administrador" }: { children: React.ReactNode; role?: "Administrador" | "Operador" }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);
  return (
    <div className={`app-shell ${open ? "menu-open" : ""}`} data-menu-open={open}>
      <button className="mobile-backdrop" aria-label="Fechar menu" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} />
      <Sidebar role={role} onNavigate={() => setOpen(false)} />
      <div className="app-main">
        <Topbar role={role} menuOpen={open} onMenu={() => setOpen((value) => !value)} />
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
