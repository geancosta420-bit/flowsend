"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Download, MessageCircle, Plus, RefreshCw, Send, Target, Trophy, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type DashboardSnapshot = {
  generatedAt: string;
  metrics: { contacts: number; campaigns: number; messagesSent: number; replies: number; interested: number; opportunities: number; sales: number; connectedInstances: number };
  chartData: { day: string; sent: number; replies: number; conversions: number }[];
  stages: { name: string; n: number }[];
  campaigns: { id: string; name: string; audience: string; date: string; sent: number; total: number; replies: number; status: string }[];
  recentActivity: { id: string; direction: string; text: string; time: string; contactName: string }[];
};

const periods = [{ label: "7 dias", days: 7 }, { label: "30 dias", days: 30 }, { label: "90 dias", days: 90 }];
const metrics = [
  { label: "Contatos", key: "contacts", icon: Users, color: "blue" },
  { label: "Campanhas", key: "campaigns", icon: Send, color: "purple" },
  { label: "Mensagens enviadas", key: "messagesSent", icon: MessageCircle, color: "green" },
  { label: "Respostas", key: "replies", icon: RefreshCw, color: "orange" },
  { label: "Leads interessados", key: "interested", icon: Target, color: "pink" },
  { label: "Oportunidades", key: "opportunities", icon: Target, color: "teal" },
  { label: "Vendas", key: "sales", icon: Trophy, color: "yellow" },
] as const;

async function fetchDashboard(days: number): Promise<DashboardSnapshot> {
  const response = await fetch(`/api/dashboard?days=${days}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível carregar o dashboard.");
  return data;
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export default function Dashboard() {
  const [days, setDays] = useState(7);
  const [userName, setUserName] = useState("Usuário");
  const [greeting, setGreeting] = useState("Bom dia");
  const query = useQuery({ queryKey: ["dashboard", days], queryFn: () => fetchDashboard(days), refetchInterval: 10_000 });
  const snapshot = query.data;

  useEffect(() => {
    let active = true;
    const updateGreeting = () => {
      const hour = new Date().getHours();
      setGreeting(hour >= 5 && hour < 12 ? "Bom dia" : hour >= 12 && hour < 18 ? "Boa tarde" : "Boa noite");
    };
    updateGreeting();
    const timer = window.setInterval(updateGreeting, 60_000);
    fetch("/api/auth/me", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => {
      if (active && data?.user?.name) setUserName(String(data.user.name).trim().split(/\s+/)[0]);
    }).catch(() => undefined);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  function exportDashboard() {
    if (!snapshot) return;
    const rows = [["Indicador", "Valor"], ...metrics.map((metric) => [metric.label, String(snapshot.metrics[metric.key])])];
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\uFEFF" + rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    link.download = "flowsend-dashboard.csv"; link.click(); URL.revokeObjectURL(link.href);
  }

  return <>
    <div className="page-heading">
      <div><div className="eyebrow">{new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date()).toLocaleUpperCase("pt-BR")}</div><h1>{greeting}, {userName} <span>✦</span></h1><p>Acompanhe os dados reais da sua operação.</p></div>
      <div className="heading-actions"><button className="btn btn-outline" onClick={exportDashboard} disabled={!snapshot}><Download size={15}/> Exportar</button><Link className="btn btn-primary" href="/campanhas"><Plus size={17}/> Nova campanha</Link></div>
    </div>
    <div className="overview-strip"><div className="live-chip"><i/> {snapshot?.metrics.connectedInstances ? "Operação conectada" : "Aguardando conexão"}</div><span>{snapshot ? `Atualizado ${formatTime(snapshot.generatedAt)}` : query.isLoading ? "Carregando dados…" : "Dados indisponíveis"}</span><div className="strip-divider"/><span><span className="connected-dot"/> {snapshot?.metrics.connectedInstances || 0} instâncias conectadas</span><Link href="/integracoes">Ver integrações <ArrowRight size={13}/></Link></div>
    {query.isError && <div className="warning-box">{query.error.message}</div>}
    <section className="metric-grid">{metrics.map((metric) => { const Icon = metric.icon; const value = snapshot?.metrics[metric.key]; return <article className="metric-card" key={metric.key}><div className="metric-top"><span>{metric.label}</span><span className={`metric-icon ${metric.color}`}><Icon size={16}/></span></div><div className="metric-value">{value === undefined ? "—" : value.toLocaleString("pt-BR")}</div><div className="metric-foot"><span>{query.isFetching ? "Atualizando…" : "Dados registrados"}</span></div></article>; })}</section>
    <div className="dashboard-grid">
      <section className="panel chart-panel"><div className="panel-head"><div><h2>Atividade da operação</h2><p>Mensagens e respostas registradas no período</p></div><select className="select-button" aria-label="Período do gráfico" value={days} onChange={(event) => setDays(Number(event.target.value))}>{periods.map((period) => <option key={period.days} value={period.days}>{period.label}</option>)}</select></div><div className="chart-legend"><span><i className="legend-blue"/> Enviadas</span><span><i className="legend-violet"/> Respostas</span></div><div className="chart-wrap">{snapshot?.chartData.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={snapshot.chartData} margin={{ left: -25, right: 4, top: 10, bottom: 0 }}><defs><linearGradient id="sent" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4f73ea" stopOpacity={.2}/><stop offset="95%" stopColor="#4f73ea" stopOpacity={0}/></linearGradient><linearGradient id="replies" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a184f7" stopOpacity={.15}/><stop offset="95%" stopColor="#a184f7" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#27272a" vertical={false}/><XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#a1a1aa" }}/><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#71717a" }}/><Tooltip contentStyle={{ background: "#17171c", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, fontSize: 12, color: "#f4f4f5" }}/><Area type="monotone" dataKey="sent" stroke="#4f73ea" strokeWidth={2.4} fill="url(#sent)"/><Area type="monotone" dataKey="replies" stroke="#a184f7" strokeWidth={2} fill="url(#replies)"/></AreaChart></ResponsiveContainer> : <div className="empty-note">Ainda não há mensagens registradas neste período.</div>}</div><div className="chart-bottom"><span><b>{(snapshot?.metrics.messagesSent || 0).toLocaleString("pt-BR")}</b> mensagens registradas</span></div></section>
      <section className="panel funnel-panel"><div className="panel-head"><div><h2>Funil de vendas</h2><p>Contatos por etapa no CRM</p></div><Link className="icon-button" aria-label="Abrir CRM" href="/crm"><ArrowUpRight size={18}/></Link></div><div className="funnel-list">{snapshot?.stages.map((stage, index) => { const max = snapshot.stages[0]?.n || 0; const width = max ? Math.round(stage.n / max * 100) : 0; return <div className="funnel-row" key={stage.name}><span className="funnel-name"><i className={`funnel-dot f${index}`}/>{stage.name}</span><div className="funnel-bar"><i style={{ width: `${width}%` }}/></div><b>{stage.n.toLocaleString("pt-BR")}</b><small>{width}%</small></div>; })}</div><Link href="/crm" className="panel-link">Ver pipeline completo <ArrowRight size={14}/></Link></section>
      <section className="panel campaigns-panel"><div className="panel-head"><div><h2>Campanhas recentes</h2><p>Campanhas criadas com público associado</p></div><Link href="/campanhas" className="text-link">Ver todas <ArrowRight size={13}/></Link></div><div className="campaign-table"><div className="campaign-header"><span>CAMPANHA</span><span>PROGRESSO</span><span>RESPOSTAS</span><span>STATUS</span><span/></div>{snapshot?.campaigns.map((campaign) => <div className="campaign-row" key={campaign.id}><div className="campaign-name"><span className="campaign-symbol"><Send size={15}/></span><span><b>{campaign.name}</b><small>{campaign.audience} · {campaign.date}</small></span></div><div className="progress-cell"><div className="progress-top"><b>{campaign.sent.toLocaleString("pt-BR")}</b><small>/{campaign.total.toLocaleString("pt-BR")}</small></div><div className="progress-track"><i style={{ width: `${campaign.total ? Math.min(100, campaign.sent / campaign.total * 100) : 0}%` }}/></div></div><b className="reply-count">{campaign.replies.toLocaleString("pt-BR")}</b><span className={`status-pill ${campaign.status === "Ativa" ? "status-green" : campaign.status === "Concluída" ? "status-gray" : "status-blue"}`}><i/>{campaign.status}</span><Link className="icon-button" aria-label="Ver campanhas" href="/campanhas"><ArrowUpRight size={16}/></Link></div>)}{!snapshot?.campaigns.length && <div className="empty-note">Nenhuma campanha com atividade real neste período.</div>}</div></section>
      <section className="panel activity-panel"><div className="panel-head"><div><h2>Atividade recente</h2><p>Mensagens reais recebidas e enviadas</p></div><Link className="icon-button" aria-label="Abrir mensagens" href="/mensagens"><ArrowUpRight size={18}/></Link></div><div className="activity-list">{snapshot?.recentActivity.map((activity) => <div className="activity-item" key={activity.id}><span className={`activity-avatar ${activity.direction === "in" ? "av-green" : "av-blue"}`}><MessageCircle size={15}/></span><div><p><b>{activity.contactName}</b> {activity.direction === "in" ? "respondeu" : "recebeu uma mensagem"}</p><small>{activity.text}</small><time>{formatTime(activity.time)}</time></div></div>)}{!snapshot?.recentActivity.length && <div className="empty-note">As mensagens aparecerão aqui quando houver atividade.</div>}</div><Link href="/mensagens" className="panel-link">Abrir conversas <ArrowRight size={14}/></Link></section>
    </div>
  </>;
}
