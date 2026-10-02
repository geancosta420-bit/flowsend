"use client";

import { useEffect, useState } from "react";
import { MoreHorizontal, Plus, Search, Tag, Trash2, Users, X } from "lucide-react";

type ListRow = { id: string; name: string; tag: string; count: number; lastCampaign: string; replyRate: string };
export default function Lists() {
  const [rows, setRows] = useState<ListRow[]>([]); const [query, setQuery] = useState(""); const [toast, setToast] = useState("");
  const [formOpen, setFormOpen] = useState(false); const [editing, setEditing] = useState<ListRow | null>(null); const [deleting, setDeleting] = useState<ListRow | null>(null); const [form, setForm] = useState({ name: "", tag: "" });
  async function load() { const response = await fetch("/api/lists"); if (response.ok) setRows(await response.json()); }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load().catch(() => setToast("Não foi possível carregar listas.")); }, []);
  function startCreate() { setEditing(null); setForm({ name: "", tag: "" }); setFormOpen(true); }
  function startEdit(row: ListRow) { setEditing(row); setForm({ name: row.name, tag: row.tag }); setFormOpen(true); }
  async function save(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const response = await fetch("/api/lists", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing ? { id: editing.id, changes: form } : form) }); const data = await response.json(); if (!response.ok) { setToast(data.error || "Não foi possível salvar a lista."); return; } setFormOpen(false); await load(); }
  async function remove() { if (!deleting) return; const response = await fetch("/api/lists", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: deleting.id }) }); if (!response.ok) { setToast("Não foi possível excluir a lista."); return; } setRows((current) => current.filter((row) => row.id !== deleting.id)); setDeleting(null); }
  const filtered = rows.filter((row) => row.name.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  return <>
    {toast && <button className="connection-state" onClick={() => setToast("")}>{toast} <X size={13}/></button>}
    <div className="page-heading"><div><h1>Listas</h1><p>Segmente contatos por tags para campanhas mais relevantes.</p></div><button className="btn btn-primary" onClick={startCreate}><Plus size={15}/> Nova lista</button></div>
    <label className="input-search"><Search size={14}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar listas..."/></label>
    <div className="soft-card-grid">{filtered.map((row) => <article className="soft-card" key={row.id}><div style={{ display: "flex", justifyContent: "space-between" }}><h3>{row.name}</h3><button className="icon-button" aria-label="Editar lista" onClick={() => startEdit(row)}><MoreHorizontal size={16}/></button></div><div className="soft-number">{row.count.toLocaleString("pt-BR")}</div><p><Users size={12}/> contatos elegíveis com consentimento</p><div className="lead-card-bottom"><span><Tag size={12}/> Tag: {row.tag}</span><span>Respostas {row.replyRate}</span></div><p style={{ marginTop: 10 }}>Última campanha: {row.lastCampaign}</p><button className="filter-btn" style={{ marginTop: 8 }} onClick={() => setDeleting(row)}><Trash2 size={13}/> Excluir lista</button></article>)}</div>{filtered.length === 0 && <div className="empty-note">Nenhuma lista encontrada.</div>}
    {formOpen && <div className="modal-backdrop" onClick={() => setFormOpen(false)}><form className="modal" onSubmit={save} onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setFormOpen(false)} aria-label="Fechar"><X size={17}/></button><h2>{editing ? "Editar lista" : "Nova lista"}</h2><p>Use uma tag para reunir contatos elegíveis para campanhas.</p><div className="form-grid"><div className="form-field full"><label>Nome da lista</label><input required maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></div><div className="form-field full"><label>Tag de segmentação</label><input required maxLength={80} value={form.tag} onChange={(event) => setForm({ ...form, tag: event.target.value })}/></div></div><div className="modal-actions"><button type="button" className="btn btn-outline" onClick={() => setFormOpen(false)}>Cancelar</button><button className="btn btn-primary">Salvar lista</button></div></form></div>}
    {deleting && <div className="modal-backdrop" onClick={() => setDeleting(null)}><section className="modal" role="dialog" aria-modal="true"><h2>Excluir lista?</h2><p>A lista “{deleting.name}” será removida. Os contatos não serão excluídos.</p><div className="modal-actions"><button className="btn btn-outline" onClick={() => setDeleting(null)}>Cancelar</button><button className="btn btn-primary" onClick={remove}>Excluir lista</button></div></section></div>}
  </>;
}
