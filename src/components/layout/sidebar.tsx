"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ChartNoAxesCombined, ChevronLeft, FileText, HelpCircle, KanbanSquare, Layers, LayoutDashboard, LogOut, MessageCircle, PanelLeftClose, Plug, Send, Settings, Shield, Users } from "lucide-react";
import { navGroups } from "@/lib/data";
import type { PlanId } from "@/lib/billing/plans";

const icons = { dashboard: LayoutDashboard, contacts: Users, lists: Layers, campaigns: Send, crm: KanbanSquare, messages: MessageCircle, templates: FileText, calendar: CalendarDays, reports: ChartNoAxesCombined, integrations: Plug, settings: Settings, userAdmin: Shield };
type Account = { id: string; name: string; email: string; role: "admin" | "user" };
type Billing = { plan: PlanId; planName: string; maxMessages: number; maxProspects: number; messagesUsed: number; prospectsUsed: number; whatsappUsed: number; maxWhatsapp: number };

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const percent = Math.min(100, limit ? used / limit * 100 : 0);
  const format = (value: number) => value.toLocaleString("pt-BR");
  return <div className="plan-usage-item"><div><span>{label}</span><b>{format(used)} / {limit >= 999_999 ? "Ilimitado" : format(limit)}</b></div><div className="usage-track"><i style={{ width: `${percent}%` }} /></div></div>;
}

export function Sidebar({ open, onClose, account, onLogout, billing }: { open: boolean; onClose: () => void; account: Account | null; onLogout: () => void; billing: Billing | null }) {
  const path = usePathname();
  const initials = account?.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";

  return <>
    <div className={`sidebar-scrim ${open ? "show" : ""}`} onClick={onClose} />
    <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
      <Link href="/" className="brand"><span className="brand-mark">F</span><span>flow<span className="brand-light">send</span><small>SALES PLATFORM</small></span></Link>
      <button className="mobile-close" onClick={onClose}><PanelLeftClose size={17} /></button>
      <button className="workspace"><span className="workspace-avatar">A</span><span><b>Acme Studio</b><small>Plano {billing?.planName || "Starter"}</small></span><ChevronLeft size={15} className="rotate" /></button>
      {navGroups.map((group) => {
        const links = group.links.filter((item) => item.href !== "/usuarios" || account?.role === "admin");
        return <div className="nav-group" key={group.label}><div className="nav-label">{group.label}</div>{links.map((item) => {
          const Icon = icons[item.icon as keyof typeof icons];
          return <Link onClick={onClose} className={`nav-item ${path === item.href ? "active" : ""}`} href={item.href} key={item.href}><Icon size={17} /><span>{item.label}</span>{item.label === "Mensagens" && <i className="nav-count">4</i>}</Link>;
        })}</div>;
      })}
      <div className="sidebar-bottom">
        <section className="usage-card plan-usage-card">
          <div className="usage-title"><span>Plano {billing?.planName || "Starter"}</span><Link href="/planos">Ver planos</Link></div>
          {billing ? <><UsageBar label="Mensagens" used={billing.messagesUsed} limit={billing.maxMessages} /><UsageBar label="Prospects" used={billing.prospectsUsed} limit={billing.maxProspects} /><small>{billing.whatsappUsed} de {billing.maxWhatsapp} conexões WhatsApp</small></> : <small>Carregando consumo do mês…</small>}
        </section>
        <button className="nav-item"><HelpCircle size={17} />Central de ajuda</button>
        <div className="profile"><div className="profile-avatar">{initials}</div><div><b>{account?.name || "Usuário"}</b><small>{account?.role === "admin" ? "Administrador" : "Usuário"}</small></div><button aria-label="Sair" title="Sair" onClick={onLogout}><LogOut size={17} /></button></div>
      </div>
    </aside>
  </>;
}
