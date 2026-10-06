"use client";

import { Bell, CalendarDays, CreditCard, Menu, Search } from "lucide-react";
import Link from "next/link";
import { currentMonthRangeLabel } from "@/lib/billing";

export function Topbar({
  onMenu,
  menuOpen = false,
  role = "Administrador",
}: {
  onMenu?: () => void;
  menuOpen?: boolean;
  role?: "Administrador" | "Operador";
}) {
  const operator = role === "Operador";
  const title = operator ? "Operador" : "Admin";

  return (
    <header className="topbar">
      <button className="icon-button mobile-menu" aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={menuOpen} onClick={onMenu}><Menu size={22} /></button>
      <Link className="mobile-brand" href={operator ? "/operador" : "/dashboard"} aria-label="TheGestor, início"><span className="brand-mark"><CreditCard size={19} /></span><b>thegestor</b></Link>
      <label className="global-search"><Search size={18} /><input placeholder="Buscar clientes, cobranças, recibos..." aria-label="Busca global" /></label>
      <div className="topbar-actions">
        <div className="date-filter" aria-label="Período atual"><CalendarDays size={17} /><span>{currentMonthRangeLabel()}</span></div>
        <button className="icon-button" aria-label="Notificações"><Bell size={19} /></button>
        <div className="user-chip"><span className="avatar">{operator ? "O" : "A"}</span><span><b>{title}</b><small>{role}</small></span></div>
      </div>
    </header>
  );
}
