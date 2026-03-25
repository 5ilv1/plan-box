"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import EnseignantLayout from "@/components/EnseignantLayout";

interface TexteEleve {
  id: string;
  prenom: string;
  nom: string;
  classe: string;
  statut: string;
  texteJour1: string;
  texteJour2: string;
  texteJour3: string;
  texteFinal: string;
  nbErreursJour2: number;
  nbErreursJour3: number;
  nbErreursJour4: number;
}

export default function AtelierEcriturePage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [sujet, setSujet] = useState("");
  const [contrainte, setContrainte] = useState("");
  const [semaine, setSemaine] = useState("");
  const [textes, setTextes] = useState<TexteEleve[]>([]);
  const [selected, setSelected] = useState<TexteEleve | null>(null);
  const [jourVisu, setJourVisu] = useState<1 | 2 | 3 | 4>(4);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push("/enseignant"); return; }
      fetch("/api/ecriture/textes-finaux")
        .then(r => r.json())
        .then(data => {
          setSujet(data.sujet ?? "");
          setContrainte(data.contrainte ?? "");
          setSemaine(data.semaine ?? "");
          setTextes(data.textes ?? []);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    });
  }, [router, supabase]);

  function getTexteJour(t: TexteEleve, j: number): string {
    if (j === 1) return t.texteJour1;
    if (j === 2) return t.texteJour2 || t.texteJour1;
    if (j === 3) return t.texteJour3 || t.texteJour2 || t.texteJour1;
    return t.texteFinal || t.texteJour3 || t.texteJour2 || t.texteJour1;
  }

  function nbMots(txt: string): number {
    return txt.trim() ? txt.trim().split(/\s+/).length : 0;
  }

  function printViaIframe(html: string) {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-9999px";
    iframe.style.width = "0";
    iframe.style.height = "0";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
      }, 300);
    };
  }

  function imprimer() {
    if (!selected) return;
    printViaIframe(`
      <html><head><title>Texte — ${selected.prenom} ${selected.nom}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700;800&family=Manrope:wght@400;600&display=swap');
        body { font-family: 'Manrope', sans-serif; padding: 40px; color: #222; }
        h1 { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 22px; margin-bottom: 4px; }
        h2 { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 16px; color: #555; font-weight: 600; margin-bottom: 24px; }
        .meta { font-size: 13px; color: #666; margin-bottom: 20px; border-bottom: 2px solid #eee; padding-bottom: 12px; }
        .texte { font-size: 15px; line-height: 2; white-space: pre-wrap; }
        @page { size: A4; margin: 20mm; }
      </style></head><body>
      <h1>${selected.prenom} ${selected.nom}</h1>
      <h2>${selected.classe}</h2>
      <div class="meta">
        <strong>Sujet :</strong> ${sujet}<br>
        <strong>Semaine :</strong> ${semaine}
      </div>
      <div class="texte">${getTexteJour(selected, jourVisu)}</div>
      </body></html>
    `);
  }

  function imprimerTous() {
    const items = textes
      .filter(t => getTexteJour(t, 4).trim().length > 0)
      .map(t => `
        <div style="padding: 16px 0; page-break-inside: avoid;">
          <div style="display: flex; align-items: baseline; gap: 12px; margin-bottom: 6px;">
            <h3 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 16px; font-weight: 800; margin: 0;">${t.prenom} ${t.nom}</h3>
            <span style="font-size: 12px; color: #888;">${t.classe}</span>
          </div>
          <div style="font-size: 13px; line-height: 1.8; white-space: pre-wrap; padding-left: 12px; border-left: 3px solid #7C3AED;">${getTexteJour(t, 4)}</div>
        </div>
      `);
    const content = items.join('<hr style="border: none; border-top: 1px solid #ddd; margin: 8px 0;">');

    printViaIframe(`
      <html><head><title>Textes finaux — Atelier d'écriture</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700;800&family=Manrope:wght@400;600&display=swap');
        body { font-family: 'Manrope', sans-serif; padding: 40px; color: #222; }
        @page { size: A4; margin: 15mm 20mm; }
      </style></head><body>
      <div style="margin-bottom: 20px; border-bottom: 2px solid #7C3AED; padding-bottom: 12px;">
        <h1 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 20px; margin: 0 0 4px;">Atelier d'écriture — ${semaine}</h1>
        <p style="font-size: 13px; color: #555; margin: 0;"><strong>Sujet :</strong> ${sujet}</p>
      </div>
      ${content}
      </body></html>
    `);
  }

  if (loading) {
    return (
      <EnseignantLayout>
        <div className="skeleton" style={{ height: 200, borderRadius: 16 }} />
      </EnseignantLayout>
    );
  }

  const finalises = textes.filter(t => t.statut === "fait" || t.texteFinal.trim().length > 0);
  const enCours = textes.filter(t => t.statut !== "fait" && t.texteFinal.trim().length === 0);

  return (
    <EnseignantLayout>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 className="ens-page-title" style={{ marginBottom: 4 }}>Atelier d&apos;écriture</h2>
          <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)" }}>
            Semaine du {semaine} — {textes.length} élève{textes.length > 1 ? "s" : ""}
          </p>
        </div>
        {textes.length > 0 && (
          <button
            onClick={imprimerTous}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "var(--pb-primary)", color: "white", border: "none",
              borderRadius: 12, padding: "10px 20px", fontSize: 14,
              fontWeight: 700, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            <span className="ms" style={{ fontSize: 20 }}>print</span>
            Imprimer tous les textes ({textes.filter(t => getTexteJour(t, 4).trim().length > 0).length})
          </button>
        )}
      </div>

      {/* Sujet */}
      {sujet && (
        <div style={{
          background: "linear-gradient(135deg, rgba(124,58,237,0.06), rgba(124,58,237,0.12))",
          border: "1.5px solid rgba(124,58,237,0.2)",
          borderRadius: 16, padding: "16px 20px", marginBottom: 24,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#7C3AED", marginBottom: 6 }}>
            Sujet de la semaine
          </div>
          <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 16, color: "var(--pb-on-surface)", margin: 0 }}>
            {sujet}
          </p>
        </div>
      )}

      {textes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--pb-on-surface-variant)" }}>
          <span className="ms" style={{ fontSize: 48, display: "block", marginBottom: 12, opacity: 0.3 }}>edit_note</span>
          <p style={{ fontWeight: 600 }}>Aucun atelier d&apos;écriture cette semaine</p>
          <p style={{ fontSize: 13 }}>Activez le mode semaine et affectez un thème pour commencer.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {textes.map((t) => {
            const texte = getTexteJour(t, 4);
            const mots = nbMots(texte);
            const isFinal = t.statut === "fait" || t.texteFinal.trim().length > 0;

            return (
              <div
                key={t.id}
                onClick={() => { setSelected(t); setJourVisu(4); }}
                style={{
                  display: "flex", alignItems: "center", gap: 16,
                  padding: "14px 20px", borderRadius: 14, cursor: "pointer",
                  background: isFinal ? "#f0fdf4" : "white",
                  border: `1.5px solid ${isFinal ? "#BBF7D0" : "var(--pb-outline-variant, #ddd)"}`,
                  transition: "box-shadow 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
              >
                <span className="ms" style={{ fontSize: 24, color: isFinal ? "#16A34A" : "var(--pb-on-surface-variant)", flexShrink: 0 }}>
                  {isFinal ? "check_circle" : "edit_note"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 15, color: "var(--pb-on-surface)" }}>
                    {t.prenom} {t.nom}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)" }}>
                    {t.classe} — {mots > 0 ? `${mots} mots` : "pas encore commencé"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999,
                    background: isFinal ? "#DCFCE7" : "#F3F4F6",
                    color: isFinal ? "#166534" : "#6B7280",
                  }}>
                    {isFinal ? "Finalisé" : t.statut === "en_cours" ? "En cours" : "À faire"}
                  </span>
                  <span className="ms" style={{ fontSize: 18, color: "var(--pb-on-surface-variant)" }}>chevron_right</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modale de lecture du texte ── */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            backgroundColor: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            ref={printRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "white", borderRadius: 24,
              padding: "32px 36px", maxWidth: 720, width: "100%",
              maxHeight: "85vh", overflowY: "auto",
              boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 22, color: "var(--pb-on-surface)", margin: 0 }}>
                  {selected.prenom} {selected.nom}
                </h3>
                <p style={{ fontSize: 14, color: "var(--pb-on-surface-variant)", marginTop: 4 }}>
                  {selected.classe} — {nbMots(getTexteJour(selected, jourVisu))} mots
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={imprimer}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "var(--pb-primary)", color: "white", border: "none",
                    borderRadius: 10, padding: "8px 16px", fontSize: 13,
                    fontWeight: 700, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                >
                  <span className="ms" style={{ fontSize: 18 }}>print</span>
                  Imprimer
                </button>
                <button
                  onClick={() => setSelected(null)}
                  style={{
                    background: "var(--pb-surface-container, #f0f0f0)", border: "none",
                    width: 36, height: 36, borderRadius: 10, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <span className="ms" style={{ fontSize: 20, color: "var(--pb-on-surface-variant)" }}>close</span>
                </button>
              </div>
            </div>

            {/* Toggle jour */}
            <div style={{ display: "flex", gap: 4, background: "var(--pb-surface-container, #e7e6ff)", borderRadius: 10, padding: 3, marginBottom: 20 }}>
              {([
                { j: 1 as const, label: "J1 Brouillon" },
                { j: 2 as const, label: "J2 Correction" },
                { j: 3 as const, label: "J3 Amélioration" },
                { j: 4 as const, label: "J4 Final" },
              ]).map(({ j, label }) => (
                <button
                  key={j}
                  onClick={() => setJourVisu(j)}
                  style={{
                    flex: 1, padding: "6px 8px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                    border: "none", cursor: "pointer",
                    background: jourVisu === j ? "white" : "transparent",
                    color: jourVisu === j ? "var(--pb-on-surface)" : "var(--pb-on-surface-variant)",
                    boxShadow: jourVisu === j ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Texte */}
            {getTexteJour(selected, jourVisu).trim() ? (
              <div style={{
                background: "var(--pb-surface-container-low, #f8f8ff)",
                borderRadius: 16, padding: "24px 28px",
                fontSize: 15, lineHeight: 2,
                color: "var(--pb-on-surface)",
                whiteSpace: "pre-wrap",
                fontFamily: "Manrope, sans-serif",
                minHeight: 200,
              }}>
                {getTexteJour(selected, jourVisu)}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "3rem", color: "var(--pb-on-surface-variant)" }}>
                <span className="ms" style={{ fontSize: 36, display: "block", marginBottom: 8, opacity: 0.3 }}>edit_off</span>
                <p>Pas encore de texte pour ce jour</p>
              </div>
            )}

            {/* Stats erreurs */}
            <div style={{ display: "flex", gap: 16, marginTop: 16, fontSize: 12, fontWeight: 600, color: "var(--pb-on-surface-variant)" }}>
              <span>J2 : {selected.nbErreursJour2} erreur{selected.nbErreursJour2 > 1 ? "s" : ""}</span>
              <span>J3 : {selected.nbErreursJour3} erreur{selected.nbErreursJour3 > 1 ? "s" : ""}</span>
              <span>J4 : {selected.nbErreursJour4} erreur{selected.nbErreursJour4 > 1 ? "s" : ""}</span>
            </div>
          </div>
        </div>
      )}
    </EnseignantLayout>
  );
}
