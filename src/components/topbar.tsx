"use client";

import { Bell, CalendarDays, Menu, Search } from "lucide-react";
import { currentMonthRangeLabel } from "@/lib/billing";

export function Topbar({
  onMenu,
  role = "Administrador",
}: {
  onMenu?: () => void;
  role?: "Administrador" | "Operador";
}) {
  const operator = role === "Operador";
  const title = operator ? "Operador" : "Admin";

  return (
    <header className="topbar">
      <button className="icon-button mobile-menu" aria-label="Abrir menu" onClick={onMenu}><Menu size={22} /></button>
      <label className="global-search"><Search size={18} /><input placeholder="Buscar clientes, cobranças, recibos..." aria-label="Busca global" /></label>
      <div className="topbar-actions">
        <div className="date-filter" aria-label="Período atual"><CalendarDays size={17} /><span>{currentMonthRangeLabel()}</span></div>
        <button className="icon-button" aria-label="Notificações"><Bell size={19} /></button>
        <div className="user-chip"><span className="avatar">{operator ? "O" : "A"}</span><span><b>{title}</b><small>{role}</small></span></div>
      </div>
    </header>
  );
}
