"use client";
import {useEffect,useState} from "react";
import {usePathname,useRouter} from "next/navigation";
import Link from "next/link";
import {Bell,Search,Command,Menu,LogOut,Crown} from "lucide-react";
import {Sidebar} from "./sidebar";
import {UpgradeModal} from "@/components/billing/upgrade-modal";
import type {PlanId} from "@/lib/billing/plans";

type Account={id:string;name:string;email:string;role:"admin"|"user"};
type Billing={plan:PlanId;planName:string;maxMessages:number;maxProspects:number;messagesUsed:number;prospectsUsed:number;whatsappUsed:number;maxWhatsapp:number};
const titles:Record<string,string>={"/":"Visão geral","/contatos":"Contatos","/campanhas":"Campanhas","/crm":"CRM","/mensagens":"Mensagens","/integracoes":"Integrações","/listas":"Listas","/templates":"Templates","/agendamentos":"Agendamentos","/relatorios":"Relatórios","/configuracoes":"Configurações","/usuarios":"Usuários","/planos":"Planos e preços"};
export function Shell({children}:{children:React.ReactNode}){
 const[open,setOpen]=useState(false);const[account,setAccount]=useState<Account|null>(null);const[billing,setBilling]=useState<Billing|null>(null);const[upgradeMessage,setUpgradeMessage]=useState("");const path=usePathname();const router=useRouter();
 useEffect(()=>{if(path==="/login")return;fetch("/api/auth/me").then(async response=>{if(!response.ok)throw new Error("Sessão expirada.");const data=await response.json();setAccount(data.user)}).catch(()=>window.location.replace("/login"))},[path]);
 useEffect(()=>{if(path==="/login")return;const refresh=()=>fetch("/api/billing",{cache:"no-store"}).then(async response=>{if(response.ok){const data=await response.json();setBilling(data.subscription)}}).catch(()=>{});refresh();const timer=window.setInterval(refresh,30000);window.addEventListener("flowsend:billing-changed",refresh);return()=>{window.clearInterval(timer);window.removeEventListener("flowsend:billing-changed",refresh)}},[path]);
 useEffect(()=>{const onLimit=(event:Event)=>{const detail=(event as CustomEvent<{message?:string}>).detail;setUpgradeMessage(detail?.message||"Seu plano atingiu um limite.")};window.addEventListener("flowsend:plan-limit",onLimit);return()=>window.removeEventListener("flowsend:plan-limit",onLimit)},[]);
 async function logout(){await fetch("/api/auth/logout",{method:"POST"}).catch(()=>{});router.replace("/login")}
 if(path==="/login")return <>{children}</>;
 const initials=account?.name.split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase()||"U";
 return <div className="app-shell"><Sidebar open={open} onClose={()=>setOpen(false)} account={account} onLogout={logout} billing={billing}/><main className="main"><header className="topbar"><button className="menu-button" onClick={()=>setOpen(true)} aria-label="Abrir menu"><Menu/></button><div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>{titles[path]||"FlowSend"}</strong></div><div className="top-actions"><button className="search-trigger"><Search size={15}/> <span>Buscar contatos, campanhas...</span><kbd><Command size={11}/> K</kbd></button><Link href="/planos" className="top-plan-badge"><Crown size={13}/> Plano {billing?.planName||"Starter"}</Link><button className="icon-button notification" aria-label="Notificações"><Bell size={18}/><i/></button><div className="top-divider"/><button className="top-account" onClick={logout} title="Sair"><span className="profile-avatar">{initials}</span><LogOut size={15}/></button></div></header><div className="page-wrap">{children}</div></main><UpgradeModal message={upgradeMessage} onClose={()=>setUpgradeMessage("")}/></div>
}
