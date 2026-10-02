"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus, MoreHorizontal, Paperclip, Plus, Radio, RefreshCw, Search, Send, Smile, X } from "lucide-react";
import type { Contact, Message } from "@/types";
import { fetchAllContacts } from "@/lib/contacts/fetch-all";
import { notifyBillingUpdated, notifyPlanLimit } from "@/lib/billing/client";
/* eslint react-hooks/set-state-in-effect: off */

function clock(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

export default function Inbox() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [live, setLive] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [newContactId, setNewContactId] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [firstMessage, setFirstMessage] = useState("");

  const loadContacts = useCallback(async () => setContacts(await fetchAllContacts()), []);
  const loadMessages = useCallback(async (id: string) => {
    if (!id) return;
    const response = await fetch(`/api/messages?contactId=${encodeURIComponent(id)}`, { cache: "no-store" });
    if (response.ok) setMessages(await response.json());
  }, []);

  useEffect(() => { loadContacts().catch(() => setToast("Não foi possível carregar os contatos.")); }, [loadContacts]);
  useEffect(() => {
    if (!selectedId) return;
    loadMessages(selectedId).catch(() => setToast("Não foi possível carregar as mensagens."));
    const source = new EventSource(`/api/messages/events?contactId=${encodeURIComponent(selectedId)}`);
    source.addEventListener("ready", () => setLive(true));
    source.addEventListener("update", (event) => {
      const detail = JSON.parse((event as MessageEvent<string>).data) as { contactId: string };
      if (detail.contactId === selectedId) {
        loadMessages(selectedId).catch(() => {});
        loadContacts().catch(() => {});
      }
    });
    source.onerror = () => setLive(false);
    return () => source.close();
  }, [selectedId, loadContacts, loadMessages]);

  const contact = contacts.find((row) => row.id === selectedId);
  const filtered = useMemo(() => contacts.filter((row) => [row.name, row.company, row.phone].join(" ").toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))), [contacts, query]);

  async function send() {
    if (!contact || !text.trim() || busy) return;
    if (contact.optedOut) { setToast("Este contato bloqueou novas mensagens."); return; }
    setBusy(true); setToast("");
    try {
      const response = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId: contact.id, text }) });
      const data = await response.json();
      if (!response.ok) {
        if (data.code === "PLAN_LIMIT") notifyPlanLimit(data.error || "Limite do plano atingido.");
        throw new Error(data.error || "Falha ao enviar.");
      }
      setMessages((rows) => rows.some((row) => row.id === data.id) ? rows : [...rows, data]);
      notifyBillingUpdated(); setText(""); setToast("Mensagem enviada pela Evolution API.");
      loadContacts().catch(() => {});
    } catch (error) { setToast(error instanceof Error ? error.message : "Falha ao enviar mensagem."); }
    finally { setBusy(false); }
  }

  async function startConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !firstMessage.trim() || (!newContactId && !newPhone.trim())) return;
    setBusy(true); setToast("");
    try {
      const response = await fetch("/api/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(newContactId ? { contactId: newContactId } : { phone: newPhone, name: newName.trim() || undefined }), text: firstMessage }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.code === "PLAN_LIMIT") notifyPlanLimit(data.error || "Limite do plano atingido.");
        throw new Error(data.error || "Não foi possível iniciar a conversa.");
      }
      const resolved = data.contact as Contact | undefined;
      if (resolved) setContacts((rows) => rows.some((row) => row.id === resolved.id) ? rows : [resolved, ...rows]);
      setSelectedId(resolved?.id || newContactId);
      setMessages([data as Message]); setNewConversationOpen(false); setNewContactId(""); setNewPhone(""); setNewName(""); setFirstMessage("");
      notifyBillingUpdated(); setToast("Conversa iniciada e mensagem enviada.");
      loadContacts().catch(() => {});
    } catch (error) { setToast(error instanceof Error ? error.message : "Não foi possível iniciar a conversa."); }
    finally { setBusy(false); }
  }

  return <>
    <div className="page-heading">
      <div><div className="eyebrow">CENTRAL DE ATENDIMENTO</div><h1>Mensagens</h1><p>Converse com seus contatos em tempo real pela Evolution API.</p></div>
      <button className="btn btn-outline" onClick={() => selectedId && loadMessages(selectedId)}><RefreshCw size={14} /> Atualizar</button>
    </div>
    <div className="chat-layout">
      <aside className="chat-list">
        <div className="chat-list-toolbar">
          <label className="chat-search"><Search size={15} /><input aria-label="Buscar conversa" placeholder="Buscar conversa..." value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <button type="button" className="new-conversation-button" onClick={() => { setToast(""); setNewConversationOpen(true); }}><Plus size={15} /><span>Nova conversa</span></button>
        </div>
        <div className="chat-list-scroll">
          {filtered.map((row) => <button type="button" className={`chat-row ${selectedId === row.id ? "selected" : ""}`} key={row.id} onClick={() => { setMessages([]); setLive(false); setSelectedId(row.id); }}>
            <span className="contact-initial">{initials(row.name)}</span><span className="chat-row-copy"><b>{row.name}</b><small>{row.company || row.phone}</small></span>
          </button>)}
          {!filtered.length && <div className="chat-list-empty">{query ? "Nenhum contato encontrado." : "Sua agenda ainda está vazia."}</div>}
        </div>
      </aside>
      {contact ? <section className="chat-pane">
        <div className="chat-head"><span className="contact-initial">{initials(contact.name)}</span><div className="chat-head-copy"><b>{contact.name}</b><small>{[contact.company, contact.phone].filter(Boolean).join(" · ")}</small></div><span className={`status-pill chat-live-pill ${live ? "is-live" : ""}`}><Radio size={12} />{live ? "Ao vivo" : "Conectando"}</span><button className="icon-button" aria-label="Abrir detalhes do contato" onClick={() => router.push("/contatos")}><MoreHorizontal size={18} /></button></div>
        <div className="chat-body">{messages.length ? messages.map((message) => <div className={`bubble ${message.direction === "out" ? "out" : ""}`} key={message.id}>{message.text}<small>{message.status === "demonstration" ? "Demonstração · " : message.direction === "out" ? "Enviada · " : "Recebida · "}{clock(message.time)}</small></div>) : <div className="empty-note">Ainda não há mensagens. Inicie uma conversa com este contato.</div>}</div>
        {emojiOpen && <div className="emoji-picker">{["😊", "👋", "✨", "👍", "🎉", "❤️", "🙏", "📅"].map((emoji) => <button key={emoji} onClick={() => setText((current) => current + emoji)}>{emoji}</button>)}</div>}
        {toast && <div className="connection-state">{toast}</div>}
        <div className="chat-compose"><button className="icon-button" aria-label="Anexos de mídia" onClick={() => setToast("O envio de anexos ainda não está disponível. Envie texto ou emoji.")}><Paperclip size={17} /></button><input value={text} disabled={contact.optedOut || busy} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => event.key === "Enter" && send()} placeholder={contact.optedOut ? "Contato bloqueou mensagens" : "Escreva sua mensagem..."} /><button className="icon-button" aria-label="Emojis" onClick={() => setEmojiOpen(!emojiOpen)}><Smile size={17} /></button><button aria-label="Enviar pela Evolution API" onClick={send} disabled={busy || contact.optedOut || !text.trim()}><Send size={15} /></button></div>
      </section> : <section className="chat-pane chat-empty-pane"><div className="empty-conversation-icon"><MessageSquarePlus size={24} /></div><b>Suas conversas, em um só lugar</b><span>Selecione um contato ou inicie uma nova conversa.</span><button className="new-conversation-button" onClick={() => setNewConversationOpen(true)}><Plus size={15} /> Nova conversa</button></section>}
    </div>

    {newConversationOpen && <div className="conversation-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setNewConversationOpen(false); }}>
      <form className="conversation-modal" onSubmit={startConversation}>
        <div className="conversation-modal-heading"><div><span className="eyebrow">MENSAGENS</span><h2>Nova conversa</h2><p>Escolha alguém da agenda ou informe um WhatsApp com DDD.</p></div><button type="button" className="icon-button" aria-label="Fechar" disabled={busy} onClick={() => setNewConversationOpen(false)}><X size={18} /></button></div>
        <label className="conversation-field"><span>Contato da agenda</span><select value={newContactId} onChange={(event) => { setNewContactId(event.target.value); setNewPhone(""); }}><option value="">Selecionar contato existente...</option>{contacts.map((row) => <option value={row.id} key={row.id}>{row.name} · {row.phone}</option>)}</select></label>
        <div className="conversation-or"><span>ou informe um número</span></div>
        <div className="conversation-fields-row"><label className="conversation-field"><span>WhatsApp com DDD</span><input inputMode="tel" placeholder="(11) 99999-9999" value={newPhone} disabled={Boolean(newContactId)} onChange={(event) => setNewPhone(event.target.value)} /></label><label className="conversation-field"><span>Nome (opcional)</span><input placeholder="Ex.: Maria Silva" value={newName} disabled={Boolean(newContactId)} onChange={(event) => setNewName(event.target.value)} /></label></div>
        <label className="conversation-field"><span>Primeira mensagem</span><textarea rows={4} maxLength={4000} placeholder="Escreva a mensagem para iniciar a conversa..." value={firstMessage} onChange={(event) => setFirstMessage(event.target.value)} /></label>
        {toast && <div className="conversation-error">{toast}</div>}
        <div className="conversation-modal-actions"><button type="button" className="btn btn-outline" disabled={busy} onClick={() => setNewConversationOpen(false)}>Cancelar</button><button type="submit" className="new-conversation-button" disabled={busy || !firstMessage.trim() || (!newContactId && !newPhone.trim())}>{busy ? <><span className="conversation-spinner" /> Enviando...</> : <><Send size={14} /> Enviar e iniciar</>}</button></div>
      </form>
    </div>}
  </>;
}
