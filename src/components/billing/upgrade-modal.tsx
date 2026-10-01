"use client";

import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";

export function UpgradeModal({ message, onClose }: { message: string; onClose: () => void }) {
  if (!message) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal upgrade-modal" role="dialog" aria-modal="true" aria-labelledby="upgrade-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Fechar"><X size={17} /></button>
        <div className="eyebrow">LIMITE DO PLANO</div>
        <h2 id="upgrade-title">Seu workspace precisa de mais capacidade</h2>
        <p>{message}</p>
        <div className="upgrade-modal-actions">
          <button className="btn btn-outline" onClick={onClose}>Agora não</button>
          <Link href="/planos" className="btn btn-primary" onClick={onClose}>Ver planos <ArrowUpRight size={14} /></Link>
        </div>
      </section>
    </div>
  );
}
