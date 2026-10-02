"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileDown, Filter, LoaderCircle, Plus, Search, Upload, MoreHorizontal, Trash2, ShieldOff, X, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { notifyBillingUpdated, notifyPlanLimit } from "@/lib/billing/client";
import type { Contact } from "@/types";

type PageResult = { items: Contact[]; total: number; page: number; pageSize: number; totalPages: number };
type ContactPayload = Omit<Contact, "id" | "lastContact"> & { id?: string; lastContact?: string };
const pageSize = 25;
const emptyForm = { name: "", phone: "", company: "", email: "", city: "", segment: "", tags: "", optedIn: false };

async function readContacts(page: number, query: string, status: string): Promise<PageResult> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (query.trim()) params.set("q", query.trim());
  if (status !== "Todos os status") params.set("status", status);
  const response = await fetch(`/api/contacts?${params}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível carregar contatos.");
  if (Array.isArray(data)) return { items: data.slice((page - 1) * pageSize, page * pageSize), total: data.length, page, pageSize, totalPages: Math.max(1, Math.ceil(data.length / pageSize)) };
  return data as PageResult;
}

export default function ContactsPage() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<Contact | null>(null);
  const [statusFilter, setStatusFilter] = useState("Todos os status");
  const [selected, setSelected] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const contactsQuery = useQuery({ queryKey: ["contacts", page, q, statusFilter], queryFn: () => readContacts(page, q, statusFilter), refetchInterval: 5_000, placeholderData: (previous) => previous });
  const contacts = useMemo(() => contactsQuery.data?.items || [], [contactsQuery.data?.items]);
  const total = contactsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, contactsQuery.data?.totalPages || 1);

  const filtered = useMemo(() => contacts.filter((contact) => [contact.name, contact.phone, contact.company, contact.city, contact.segment, ...contact.tags].join(" ").toLocaleLowerCase("pt-BR").includes(q.toLocaleLowerCase("pt-BR")) && (statusFilter === "Todos os status" || (statusFilter === "Bloqueados" ? contact.optedOut : contact.status === statusFilter))), [contacts, q, statusFilter]);

  async function refreshContacts() {
    await queryClient.invalidateQueries({ queryKey: ["contacts"] });
    await queryClient.refetchQueries({ queryKey: ["contacts", page, q, statusFilter], type: "active" });
  }

  async function saveContact() {
    if (!form.name.trim() || !/^\+?[\d\s().-]{10,20}$/.test(form.phone)) { setToast("Informe nome e um WhatsApp válido."); return; }
    const body: ContactPayload = { name: form.name.trim(), phone: form.phone.trim(), company: form.company, email: form.email, city: form.city, segment: form.segment, tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean), optedIn: form.optedIn, optedOut: edit?.optedOut || false, status: edit?.status || "Novo" };
    setBusy(true);
    try {
      const response = await fetch("/api/contacts", { method: edit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(edit ? { id: edit.id, changes: body } : body) });
      const data = await response.json();
      if (!response.ok) { if (data.code === "PLAN_LIMIT") notifyPlanLimit(data.error || "Limite do plano atingido."); throw new Error(data.error || "Não foi possível salvar o contato."); }
      setModal(false); setEdit(null); setForm(emptyForm); setToast(edit ? "Contato atualizado." : "Contato criado.");
      if (!edit) setPage(1);
      await refreshContacts(); notifyBillingUpdated();
    } catch (error) { setToast(error instanceof Error ? error.message : "Falha ao salvar contato."); }
    finally { setBusy(false); }
  }

  function startEdit(contact: Contact) {
    setEdit(contact);
    setForm({ name: contact.name, phone: contact.phone, company: contact.company, email: contact.email, city: contact.city, segment: contact.segment, tags: contact.tags.join(", "), optedIn: contact.optedIn === true });
    setModal(true);
  }

  async function updateContact(contact: Contact, changes: Partial<Contact>) {
    const response = await fetch("/api/contacts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: contact.id, changes }) });
    const data = await response.json();
    if (!response.ok) { setToast(data.error || "Não foi possível atualizar o contato."); return; }
    await refreshContacts();
  }

  async function deleteSelected() {
    if (!selected.length) return;
    setBusy(true);
    try {
      const response = await fetch("/api/contacts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: selected }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível excluir contatos.");
      setToast(`${data.deleted} contato(s) excluído(s).`); setSelected([]); await refreshContacts();
    } catch (error) { setToast(error instanceof Error ? error.message : "Falha ao excluir contatos."); }
    finally { setBusy(false); }
  }

  function downloadModel() {
    const body = "Nome,WhatsApp,Empresa,Email,Cidade,Segmento,Consentimento\r\nExemplo,+55 11 99999-9999,Empresa Exemplo,contato@exemplo.com.br,São Paulo,Serviços,Não";
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\uFEFF" + body], { type: "text/csv;charset=utf-8" })); link.download = "modelo-importacao-flowsend.csv"; link.click(); URL.revokeObjectURL(link.href);
  }

  async function exportCsv() {
    try {
      const rows: Contact[] = [];
      for (let current = 1; current <= totalPages; current++) rows.push(...(await readContacts(current, q, statusFilter)).items);
      const columns = ["Nome", "WhatsApp", "Empresa", "Email", "Cidade", "Segmento", "Status", "Consentimento", "Opt-out"];
      const csv = [columns.join(","), ...rows.map((contact) => [contact.name, contact.phone, contact.company, contact.email, contact.city, contact.segment, contact.status, contact.optedIn ? "Sim" : "Não", contact.optedOut ? "Sim" : "Não"].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))].join("\r\n");
      const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })); link.download = "flowsend-contatos.csv"; link.click(); URL.revokeObjectURL(link.href);
    } catch (error) { setToast(error instanceof Error ? error.message : "Não foi possível exportar contatos."); }
  }

  async function csvImport(file?: File) {
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) { setToast("CSV sem linhas para importar."); return; }
    const parseLine = (line: string) => line.match(/(?:^|[;,])(?:"((?:[^"]|"")*)"|([^;,]*))/g)?.map((cell) => cell.replace(/^[;,]/, "").replace(/^"|"$/g, "").replace(/""/g, '"').trim()) || line.split(/[;,]/).map((cell) => cell.trim());
    const headers = parseLine(lines[0]).map((header) => header.toLocaleLowerCase("pt-BR"));
    const index = (...names: string[]) => headers.findIndex((header) => names.includes(header));
    const imported: ContactPayload[] = [];
    for (const line of lines.slice(1)) {
      const cells = parseLine(line); const get = (...names: string[]) => cells[index(...names)] || "";
      const name = get("nome", "name"); const phone = get("whatsapp", "telefone", "phone");
      if (!name || !/^\+?[\d\s().-]{10,20}$/.test(phone)) continue;
      imported.push({ name, phone, company: get("empresa", "company"), email: get("email"), city: get("cidade", "city"), segment: get("segmento", "segment"), tags: [], status: "Novo", optedIn: /^(sim|yes|true|1|opt-in)$/i.test(get("opt-in", "optin", "consentimento")), optedOut: false });
    }
    setBusy(true);
    try {
      const response = await fetch("/api/contacts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contacts: imported }) });
      const data = await response.json();
      if (!response.ok) { if (data.code === "PLAN_LIMIT") notifyPlanLimit(data.error || "Limite do plano atingido."); throw new Error(data.error || "Não foi possível importar contatos."); }
      setToast(`${data.saved ?? imported.length} registro(s) importado(s). Contatos duplicados foram atualizados.`); setPage(1); await refreshContacts(); notifyBillingUpdated();
    } catch (error) { setToast(error instanceof Error ? error.message : "Falha ao importar CSV."); }
    finally { setBusy(false); }
  }

  return <>
    {toast && <button className="connection-state" onClick={() => setToast("")}>{toast} <X size={13}/></button>}
    <div className="page-heading"><div><h1>Contatos</h1><p>Contatos do WhatsApp sincronizados e relacionamentos do CRM.</p></div><div className="heading-actions"><button className="btn btn-outline" onClick={downloadModel}><FileDown size={14}/> Baixar modelo CSV</button><button className="btn btn-outline" disabled={busy} onClick={() => document.getElementById("csv")?.click()}><Upload size={14}/> Importar CSV</button><input id="csv" hidden type="file" accept=".csv,text/csv" onChange={(event) => csvImport(event.target.files?.[0])}/><button className="btn btn-primary" onClick={() => { setEdit(null); setForm(emptyForm); setModal(true); }}><Plus size={16}/> Novo contato</button></div></div>
    <section className="page-card">
      <div className="toolbar"><label className="input-search"><Search size={15}/><input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="Buscar por nome, empresa, WhatsApp..."/></label><label className="filter-btn"><Filter size={14}/><select aria-label="Filtrar por status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} style={{ border: 0, background: "transparent", font: "inherit", color: "inherit", outline: 0 }}>{["Todos os status", "Bloqueados", "Novo", "Contatado", "Respondeu", "Interessado", "Proposta", "Negociação", "Cliente", "Sem interesse"].map((status) => <option key={status}>{status}</option>)}</select></label><button className="filter-btn" onClick={exportCsv}><Download size={14}/> Exportar</button><button className="icon-button" aria-label="Atualizar contatos" onClick={() => refreshContacts()}><RefreshCw size={14}/></button><span style={{ marginLeft: "auto", fontSize: 10, color: "#9da3b0" }}>{total.toLocaleString("pt-BR")} contatos</span>{selected.length > 0 && <button className="filter-btn" disabled={busy} onClick={deleteSelected}><Trash2 size={13}/> Excluir ({selected.length})</button>}</div>
      {contactsQuery.isError && <div className="warning-box">{contactsQuery.error.message}</div>}
      <table className="contact-table"><thead><tr><th><input type="checkbox" aria-label="Selecionar página" checked={filtered.length > 0 && filtered.every((contact) => selected.includes(contact.id))} onChange={(event) => setSelected(event.target.checked ? [...new Set([...selected, ...filtered.map((contact) => contact.id)])] : selected.filter((id) => !filtered.some((contact) => contact.id === id)))}/></th><th>CONTATO</th><th>WHATSAPP</th><th>EMPRESA</th><th>CIDADE</th><th>STATUS</th><th>ÚLTIMO CONTATO</th><th>TAGS</th><th/></tr></thead><tbody>{filtered.map((contact) => <tr key={contact.id}><td data-label="Selecionar"><input type="checkbox" checked={selected.includes(contact.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, contact.id] : selected.filter((id) => id !== contact.id))}/></td><td data-label="Contato"><div className="contact-person"><span className="contact-initial">{contact.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><span><b>{contact.name}</b><small>{contact.segment || (contact.source === "evolution" || contact.source === "waha" ? `Sincronizado · ${contact.source}` : "")}</small></span></div></td><td data-label="WhatsApp">{contact.phone}</td><td data-label="Empresa">{contact.company || "—"}</td><td data-label="Cidade">{contact.city || "—"}</td><td data-label="Status"><span className={`status-pill ${contact.optedOut ? "status-gray" : contact.status === "Interessado" || contact.status === "Cliente" ? "status-green" : "status-blue"}`}><i/>{contact.optedOut ? "Bloqueado" : contact.status}</span><small className="contact-consent">{contact.optedIn ? "Consentimento registrado" : "Sem consentimento"}</small></td><td data-label="Último contato">{contact.lastContact || "—"}</td><td data-label="Tags"><div className="tags">{contact.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div></td><td data-label="Ações"><div className="contact-actions"><button title={contact.optedOut ? "Liberar mensagens" : "Bloquear mensagens"} onClick={() => updateContact(contact, { optedOut: !contact.optedOut })}><ShieldOff size={14}/></button><button title="Editar" onClick={() => startEdit(contact)}><MoreHorizontal size={15}/></button></div></td></tr>)}</tbody></table>
      {!contactsQuery.isLoading && filtered.length === 0 && <div className="empty-note">Nenhum contato encontrado.</div>}
      <div className="modal-actions" style={{ alignItems: "center" }}><span className="help-text">Página {page} de {totalPages} · sincronização automática a cada 5 segundos</span><button className="btn btn-outline" disabled={page <= 1 || contactsQuery.isFetching} onClick={() => { setSelected([]); setPage((current) => Math.max(1, current - 1)); }}><ChevronLeft size={14}/> Anterior</button><button className="btn btn-outline" disabled={page >= totalPages || contactsQuery.isFetching} onClick={() => { setSelected([]); setPage((current) => Math.min(totalPages, current + 1)); }}>Próxima <ChevronRight size={14}/></button></div>
    </section>
    {modal && <div className="modal-backdrop" onClick={() => setModal(false)}><div className="modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setModal(false)}><X size={17}/></button><h2>{edit ? "Editar contato" : "Novo contato"}</h2><p>Adicione as informações para organizar este relacionamento.</p><div className="form-grid">{([ ["Nome", "name"], ["WhatsApp", "phone"], ["Empresa", "company"], ["Email", "email"], ["Cidade", "city"], ["Segmento", "segment"], ["Tags (separadas por vírgula)", "tags"] ] as const).map(([label, key]) => <div className="form-field" key={key}><label>{label}{key === "name" || key === "phone" ? " *" : ""}</label><input value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} placeholder={key === "phone" ? "+55 11 99999-9999" : ""}/></div>)}</div><label className="form-field full" style={{ display: "flex", alignItems: "center", gap: 10 }}><input type="checkbox" checked={form.optedIn} onChange={(event) => setForm({ ...form, optedIn: event.target.checked })}/><span>Tenho autorização registrada para enviar mensagens a este contato.</span></label><div className="modal-actions"><button className="btn btn-outline" disabled={busy} onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" disabled={busy} onClick={saveContact}>{busy ? <><LoaderCircle size={14}/> Salvando…</> : edit ? "Salvar alterações" : "Criar contato"}</button></div></div></div>}
  </>;
}
