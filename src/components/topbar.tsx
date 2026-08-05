"use client";

import { Bell, CalendarDays, Menu, Search } from "lucide-react";

export function Topbar({ onMenu }: { onMenu?: () => void }) {
  return (
    <header className="topbar">
      <button className="icon-button mobile-menu" aria-label="Abrir menu" onClick={onMenu}><Menu size={22} /></button>
      <label className="global-search"><Search size={18} /><input placeholder="Buscar clientes, cobranças, recibos..." /></label>
      <div className="topbar-actions">
        <button className="date-filter"><CalendarDays size={17} /><span>01/05/2025 - 31/05/2025</span></button>
        <button className="icon-button" aria-label="Notificações"><Bell size={19} /></button>
        <div className="user-chip"><span className="avatar">A</span><span><b>Admin</b><small>Administrador</small></span></div>
      </div>
    </header>
  );
}
