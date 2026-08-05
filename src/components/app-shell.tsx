"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({ children, role = "Administrador" }: { children: React.ReactNode; role?: "Administrador" | "Operador" }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`app-shell ${open ? "menu-open" : ""}`}>
      <div className="mobile-backdrop" onClick={() => setOpen(false)} />
      <Sidebar role={role} />
      <div className="app-main">
        <Topbar onMenu={() => setOpen((value) => !value)} />
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
