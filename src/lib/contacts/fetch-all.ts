import type { Contact } from "@/types";

type ContactPage = { items: Contact[]; totalPages: number };

export async function fetchAllContacts(): Promise<Contact[]> {
  const pageSize = 100;
  const result: Contact[] = [];
  for (let page = 1; ; page += 1) {
    const response = await fetch(`/api/contacts?page=${page}&pageSize=${pageSize}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível carregar contatos.");
    if (Array.isArray(data)) return page === 1 ? data as Contact[] : result.concat(data as Contact[]);
    const current = data as ContactPage;
    result.push(...current.items);
    if (page >= current.totalPages || current.items.length === 0) return result;
  }
}
