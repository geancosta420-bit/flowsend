"use client";

import { useEffect, useState } from "react";
import { Copy, FileText, LoaderCircle, Pencil, Plus, Sparkles, Star, Trash2, X } from "lucide-react";
import type { MessageTemplate } from "@/types";

const categories = ["Prospecção", "Oferta", "Reativação", "Follow-up", "Pós-venda", "Institucional"];
type Idea = { title: string; text: string };

export default function Templates() {
  const [rows, setRows] = useState<MessageTemplate[]>([]);
  const [modal, setModal] = useState(false);
  const [aiModal, setAiModal] = useState(false);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [form, setForm] = useState({ name: "", category: "Prospecção", text: "Olá, {{nome}}! Tudo bem? Acredito que podemos ajudar a {{empresa}}." });
  const [aiForm, setAiForm] = useState({ objective: "Vendas", tone: "Amigável", product: "" });
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [savingIdea, setSavingIdea] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<MessageTemplate | null>(null);
  const [toast, setToast] = useState("");

  async function load() {
    const response = await fetch("/api/templates");
    if (response.ok) setRows(await response.json());
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load().catch(() => setToast("Não foi possível carregar templates.")); }, []);

  function startCreate() {
    setEditing(null);
    setForm({ name: "", category: "Prospecção", text: "Olá, {{nome}}! Tudo bem? Acredito que podemos ajudar a {{empresa}}." });
    setModal(true);
  }

  function startEdit(row: MessageTemplate) {
    setEditing(row);
    setForm({ name: row.name, category: row.category, text: row.text });
    setModal(true);
  }

  async function save() {
    const response = await fetch("/api/templates", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing ? { id: editing.id, changes: form } : { ...form, favorite: false }) });
    const data = await response.json();
    if (!response.ok) { setToast(data.error || "Não foi possível salvar."); return; }
    await load();
    setModal(false);
  }

  async function generateIdeas(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoadingIdeas(true);
    setIdeas([]);
    setToast("");
    try {
      const response = await fetch("/api/templates/generate-ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(aiForm) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível gerar ideias.");
      setIdeas(data.options);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Falha ao gerar ideias.");
    } finally {
      setLoadingIdeas(false);
    }
  }

  async function saveIdea(idea: Idea, index: number) {
    setSavingIdea(index);
    const response = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: idea.title, category: aiForm.objective, text: idea.text, favorite: false }) });
    const data = await response.json();
    if (!response.ok) { setToast(data.error || "Não foi possível salvar o template."); setSavingIdea(null); return; }
    await load();
    setAiModal(false);
    setIdeas([]);
    setSavingIdea(null);
    setToast("Ideia salva na biblioteca de templates.");
  }

  async function favorite(row: MessageTemplate) {
    const response = await fetch("/api/templates", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, changes: { favorite: !row.favorite } }) });
    if (response.ok) await load();
  }

  async function duplicate(row: MessageTemplate) {
    const response = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `${row.name} — cópia`, category: row.category, text: row.text, favorite: false }) });
    if (response.ok) await load();
  }

  async function remove(row: MessageTemplate) {
    const response = await fetch("/api/templates", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id }) });
    if (response.ok) { setRows((current) => current.filter((item) => item.id !== row.id)); setDeleting(null); }
  }

  return <>
    <div className="page-heading"><div><h1>Templates</h1><p>Mensagens salvas para personalizar e reutilizar em campanhas.</p></div><div className="heading-actions"><button className="btn btn-ai" onClick={() => { setAiModal(true); setIdeas([]); }}><Sparkles size={15} /> Gerar ideia com IA</button><button className="btn btn-primary" onClick={startCreate}><Plus size={15} /> Novo template</button></div></div>

    {rows.length ? <div className="soft-card-grid">{rows.map((row) => <article className="soft-card" key={row.id}><div style={{ display: "flex", justifyContent: "space-between" }}><span className="status-pill status-blue">{row.category}</span><button className="icon-button" onClick={() => favorite(row)} aria-label={row.favorite ? "Desfavoritar" : "Favoritar"}><Star size={15} fill={row.favorite ? "#e6b24f" : "none"} /></button></div><h3 style={{ marginTop: 13 }}>{row.name}</h3><p style={{ lineHeight: 1.7, minHeight: 54, whiteSpace: "pre-wrap" }}>{row.text}</p><div className="lead-card-bottom"><span>Variáveis: nome, empresa, cidade, segmento</span><span style={{ display: "flex", gap: 10 }}><button onClick={() => startEdit(row)} aria-label="Editar"><Pencil size={14} /></button><button onClick={() => duplicate(row)} aria-label="Duplicar"><Copy size={14} /></button><button onClick={() => setDeleting(row)} aria-label="Excluir"><Trash2 size={14} /></button></span></div></article>)}</div> : <div className="page-card empty-note" style={{ padding: 40, textAlign: "center" }}><FileText size={26} style={{ margin: "0 auto 12px", color: "#818cf8" }} /><h3>Sua biblioteca começa aqui</h3><p>Crie um template ou gere uma ideia com IA para salvar sua primeira mensagem.</p></div>}

    {modal && <div className="modal-backdrop" onClick={() => setModal(false)}><div className="modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setModal(false)} aria-label="Fechar"><X size={17} /></button><h2>{editing ? "Editar template" : "Novo template"}</h2><p>Use variáveis para personalizar a mensagem por contato.</p><div className="form-grid"><div className="form-field full"><label>Nome</label><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div><div className="form-field full"><label>Categoria</label><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></div><div className="form-field full"><label>Mensagem</label><textarea value={form.text} onChange={(event) => setForm({ ...form, text: event.target.value })} /><small className="help-text">Variáveis disponíveis: nome, empresa, cidade e segmento</small></div></div><div className="modal-actions"><button className="btn btn-outline" onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={save}>Salvar template</button></div></div></div>}
    {deleting && <div className="modal-backdrop" onClick={() => setDeleting(null)}><section className="modal" role="dialog" aria-modal="true"><h2>Excluir template?</h2><p>“{deleting.name}” será removido da biblioteca.</p><div className="modal-actions"><button className="btn btn-outline" onClick={() => setDeleting(null)}>Cancelar</button><button className="btn btn-primary" onClick={() => remove(deleting)}>Excluir template</button></div></section></div>}

    {aiModal && <div className="modal-backdrop" onClick={() => setAiModal(false)}><div className="modal ai-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setAiModal(false)} aria-label="Fechar"><X size={17} /></button><h2><Sparkles size={19} style={{ display: "inline", color: "#a78bfa", marginRight: 7 }} />Gerar ideias com IA</h2><p>Crie opções personalizadas e salve as melhores na sua biblioteca.</p><div className="ai-intro"><Sparkles size={18} /><p>As mensagens são geradas como versões distintas para revisão. Envie somente para contatos que autorizaram receber comunicações.</p></div><form onSubmit={generateIdeas}><div className="form-grid"><div className="form-field"><label>Objetivo</label><select value={aiForm.objective} onChange={(event) => setAiForm({ ...aiForm, objective: event.target.value })}>{["Vendas", "Lembrete", "Recuperação de carrinho", "Follow-up", "Reativação", "Pós-venda", "Prospecção"].map((item) => <option key={item}>{item}</option>)}</select></div><div className="form-field"><label>Tom de voz</label><select value={aiForm.tone} onChange={(event) => setAiForm({ ...aiForm, tone: event.target.value })}>{["Amigável", "Direto", "Persuasivo", "Formal", "Consultivo", "Acolhedor"].map((item) => <option key={item}>{item}</option>)}</select></div><div className="form-field full"><label>Produto ou serviço</label><textarea required minLength={3} maxLength={800} placeholder="Descreva o que você oferece e o principal benefício…" value={aiForm.product} onChange={(event) => setAiForm({ ...aiForm, product: event.target.value })} /></div></div><div className="modal-actions"><button className="btn btn-outline" type="button" onClick={() => setAiModal(false)}>Fechar</button><button className="btn btn-ai" type="submit" disabled={loadingIdeas || aiForm.product.trim().length < 3}>{loadingIdeas ? <><LoaderCircle size={15} className="spin" /> Gerando…</> : <><Sparkles size={15} /> Gerar 3 ideias</>}</button></div></form>
      {ideas.length > 0 && <div className="ai-results">{ideas.map((idea, index) => <article className="ai-result" key={`${index}-${idea.title}`}><div className="ai-result-head"><h3>{idea.title}</h3><span className="status-pill status-blue">Opção {index + 1}</span></div><p>{idea.text}</p><button className="btn btn-primary" onClick={() => saveIdea(idea, index)} disabled={savingIdea !== null}>{savingIdea === index ? <><LoaderCircle size={14} className="spin" /> Salvando…</> : <><Plus size={14} /> Salvar na biblioteca</>}</button></article>)}</div>}
    </div></div>}
    {toast && <button className="connection-state" onClick={() => setToast("")}>{toast} <X size={13} /></button>}
  </>;
}
