"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CircleDollarSign, CreditCard, Link2, LogOut, Settings, ShieldCheck, Users } from "lucide-react";
import { logoutAction } from "@/app/auth/actions";

const adminItems = [
  { href: "/dashboard", label: "Visão Geral", icon: BarChart3 },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/cobrancas", label: "Cobranças", icon: CircleDollarSign },
  { href: "/integracoes", label: "Integrações", icon: Link2 },
  { href: "/usuarios", label: "Usuários", icon: ShieldCheck },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

const operatorItems = [
  { href: "/operador", label: "Painel operacional", icon: BarChart3 },
];

export function Sidebar({ role = "Administrador" }: { role?: "Administrador" | "Operador" }) {
  const pathname = usePathname();
  const items = role === "Operador" ? operatorItems : adminItems;

  return (
    <aside className="sidebar">
      <Link className="brand" href={role === "Operador" ? "/operador" : "/dashboard"}>
        <span className="brand-mark"><CreditCard size={22} /></span>
        <span><b>thegestor</b><small>Gestão de cobranças</small></span>
      </Link>
      <nav className="sidebar-nav">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return <Link key={href} href={href} className={active ? "active" : ""}><Icon size={19} /><span>{label}</span></Link>;
        })}
      </nav>
      <div className="sidebar-footer">
        <div className="role-pill"><ShieldCheck size={17} /><span>{role === "Operador" ? "Permissão operador" : "Modo administrador"}</span></div>
        <form action={logoutAction}>
          <button className="sidebar-logout" type="submit"><LogOut size={18} /><span>Sair</span></button>
        </form>
      </div>
    </aside>
  );
}
