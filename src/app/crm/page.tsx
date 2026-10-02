"use client";

import { useCallback, useEffect, useState } from "react";
import { DollarSign, Mail, MapPin, MessageCircle, MoreHorizontal, Phone, Plus, Settings2, Tag, X } from "lucide-react";
import type { Contact, ContactStatus, Message } from "@/types";
import { fetchAllContacts } from "@/lib/contacts/fetch-all";
/* eslint react-hooks/set-state-in-effect: off */

const statuses: ContactStatus[] = ["Novo", "Contatado", "Respondeu", "Interessado", "Proposta", "Negociação", "Cliente", "Sem interesse"];
const labelsDefault = ["Novo", "Contatado", "Respondeu", "Interessado", "Proposta", "Negociação", "Cliente", "Sem interesse"];
const emptyForm = { name: "", phone: "", company: "", email: "", city: "", segment: "", tags: "", optedIn: false };

export default function CRM() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [drag, setDrag] = useState<string | null>(null);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [timeline, setTimeline] = useState<Message[]>([]);
  const [toast, setToast] = useState("");
  const [newLead, setNewLead] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [labels, setLabels] = useState<string[]>(labelsDefault);
  const [customize, setCustomize] = useState(false);

  useEffect(() => { fetchAllContacts().then(setContacts).catch(() => setToast("Não foi possível carregar contatos.")); }, []);
  useEffect(() => { try { const saved = localStorage.getItem("flowsend-crm-column-labels"); if (saved) setLabels(JSON.parse(saved)); } catch {} }, []);
  const loadTimeline = useCallback(async (id: string) => { const response = await fetch(`/api/messages?contactId=${encodeURIComponent(id)}`); if (response.ok) setTimeline(await response.json()); }, []);
  useEffect(() => { if (selected) loadTimeline(selected.id).catch(() => setTimeline([])); }, [selected, loadTimeline]);

  async function updateContact(id: string, changes: Partial<Contact>) {
    const response = await fetch("/api/contacts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, changes }) });
    const data = await response.json();
    if (!response.ok) { setToast(data.error || "Não foi possível atualizar o lead."); return false; }
    setContacts((rows) => rows.map((row) => row.id === id ? data : row));
    if (selected?.id === id) setSelected(data);
    return true;
  }

  async function move(id: string, status: ContactStatus) {
    const current = contacts.find((row) => row.id === id);
    if (!current || current.status === status) return;
    const entry = `${new Date().toLocaleString("pt-BR")}: etapa alterada de ${current.status} para ${status}`;
    await updateContact(id, { status, notes: [current.notes, entry].filter(Boolean).join("\n") });
  }

  async function addLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean) }) });
    const data = await response.json();
    if (!response.ok) { setToast(data.error || "Não foi possível criar lead."); return; }
    setContacts((rows) => [data, ...rows]); setNewLead(false); setForm(emptyForm);
  }

  function saveLabels() { localStorage.setItem("flowsend-crm-column-labels", JSON.stringify(labels)); setCustomize(false); }

  return <>
    <div className="page-heading"><div><div className="eyebrow">PIPELINE DE VENDAS</div><h1>CRM</h1><p>Acompanhe oportunidades, valores, tags e histórico de relacionamento.</p></div><div className="heading-actions"><button className="btn btn-outline" onClick={() => setCustomize(true)}><Settings2 size={15}/> Personalizar colunas</button><button className="btn btn-primary" onClick={() => setNewLead(true)}><Plus size={15}/> Nova oportunidade</button></div></div>
    <div className="overview-strip"><div className="live-chip">Pipeline ativo</div><span>{contacts.length} contatos no CRM</span><span style={{ marginLeft: "auto" }}>Arraste um lead para atualizar a etapa</span></div>
    <div className="kanban">{statuses.map((status, index) => { const rows = contacts.filter((contact) => contact.status === status); return <section className="kanban-col" key={status} onDragOver={(event) => event.preventDefault()} onDrop={() => drag && move(drag, status)}><div className="kanban-title">{labels[index]} <span>{rows.length}</span></div>{rows.map((contact) => <article className="lead-card" key={contact.id} draggable onDragStart={() => setDrag(contact.id)} onClick={() => { setTimeline([]); setSelected(contact); }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b>{contact.name}</b><button className="icon-button" onClick={(event) => { event.stopPropagation(); setTimeline([]); setSelected(contact); }} aria-label="Detalhes do lead"><MoreHorizontal size={15}/></button></div><small>{contact.company || contact.phone}</small><div className="lead-value"><DollarSign size={12}/>{(contact.leadValue || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div><div className="tags">{contact.tags.map((tag) => <span className="tag" key={tag}><Tag size={10}/>{tag}</span>)}</div><div className="lead-card-bottom"><span><MessageCircle size={12}/> {contact.lastContact}</span></div></article>)}</section>; })}</div>
    {toast && <button className="connection-state" onClick={() => setToast("")}>{toast} <X size={13}/></button>}
    {newLead && <div className="modal-backdrop" onClick={() => setNewLead(false)}><form className="modal" onSubmit={addLead} onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setNewLead(false)} aria-label="Fechar"><X size={17}/></button><h2>Nova oportunidade</h2><p>Cadastre um lead e registre o consentimento para mensagens.</p><div className="form-grid">{([ ["Nome", "name"], ["WhatsApp", "phone"], ["Empresa", "company"], ["Email", "email"], ["Cidade", "city"], ["Segmento", "segment"], ["Tags (separadas por vírgula)", "tags"] ] as const).map(([label, key]) => <div className="form-field" key={key}><label>{label}</label><input required={key === "name" || key === "phone"} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })}/></div>)}</div><label className="legal-check"><input type="checkbox" checked={form.optedIn} onChange={(event) => setForm({ ...form, optedIn: event.target.checked })}/> Autorização para mensagens registrada</label><div className="modal-actions"><button type="button" className="btn btn-outline" onClick={() => setNewLead(false)}>Cancelar</button><button className="btn btn-primary">Criar oportunidade</button></div></form></div>}
    {customize && <div className="modal-backdrop" onClick={() => setCustomize(false)}><div className="modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setCustomize(false)} aria-label="Fechar"><X size={17}/></button><h2>Personalizar colunas</h2><p>Edite os nomes exibidos no quadro. Os estágios salvos nos contatos continuam iguais.</p><div className="form-grid">{labels.map((label, index) => <div className="form-field" key={statuses[index]}><label>{statuses[index]}</label><input maxLength={32} value={label} onChange={(event) => setLabels((current) => current.map((value, i) => i === index ? event.target.value : value))}/></div>)}</div><div className="modal-actions"><button className="btn btn-outline" onClick={() => { setLabels(labelsDefault); localStorage.removeItem("flowsend-crm-column-labels"); setCustomize(false); }}>Restaurar padrão</button><button className="btn btn-primary" onClick={saveLabels}>Salvar colunas</button></div></div></div>}
    {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><div className="modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setSelected(null)} aria-label="Fechar"><X size={17}/></button><div className="eyebrow">DETALHES DO LEAD</div><h2>{selected.name}</h2><p>{selected.company || "Sem empresa"} · {selected.status}</p><div className="form-field"><label>Valor da oportunidade (R$)</label><input type="number" min="0" step="0.01" value={selected.leadValue || ""} onChange={(event) => setSelected({ ...selected, leadValue: Number(event.target.value) })} onBlur={() => updateContact(selected.id, { leadValue: selected.leadValue || 0 })}/></div><div className="soft-card-grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 12 }}><div className="soft-card"><p><Phone size={13}/> WhatsApp</p><b>{selected.phone}</b></div><div className="soft-card"><p><Mail size={13}/> Email</p><b>{selected.email || "—"}</b></div><div className="soft-card"><p><MapPin size={13}/> Cidade / Segmento</p><b>{selected.city || "—"} · {selected.segment || "—"}</b></div><div className="soft-card"><p><Tag size={13}/> Tags</p><b>{selected.tags.join(", ") || "—"}</b></div></div><h3 style={{ fontSize: 12, marginTop: 18 }}>Histórico de mensagens</h3><div style={{ maxHeight: 180, overflow: "auto" }}>{timeline.length ? timeline.map((message) => <div className="activity-item" key={message.id}><span className={`activity-avatar ${message.direction === "in" ? "av-blue" : "av-green"}`}><MessageCircle size={14}/></span><div><p>{message.direction === "in" ? "Mensagem recebida" : "Mensagem enviada"} · {message.status}</p><small>{message.text}</small></div></div>) : <p className="empty-note">Ainda não há mensagens registradas.</p>}</div><h3 style={{ fontSize: 12, marginTop: 14 }}>Histórico de ações</h3><pre className="crm-history">{selected.notes || "Nenhuma ação registrada além das mensagens."}</pre><div className="modal-actions"><button className="btn btn-outline" onClick={() => setSelected(null)}>Fechar</button><a className="btn btn-primary" href="/mensagens">Abrir conversa</a></div></div></div>}
  </>;
}
