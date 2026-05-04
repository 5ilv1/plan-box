"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

interface HistoriqueEntry {
  date: string;
  texte: string;
}

interface TexteEleve {
  id: string;
  prenom: string;
  nom: string;
  classe: string;
  statut: string;
  texteCourant: string;
  texteFinal: string;
  dateEnvoi: string | null;
  historique: HistoriqueEntry[];
  nbAnnotations: number;
  nbAnnotationsNouvelles: number;
}

function lundiCourant(): string {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  return monday.toISOString().split("T")[0];
}

function decalerLundi(lundi: string, deltaSemaines: number): string {
  const d = new Date(`${lundi}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaSemaines * 7);
  return d.toISOString().split("T")[0];
}

export default function AtelierEcriturePage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [sujet, setSujet] = useState("");
  const [contrainte, setContrainte] = useState("");
  const [semaine, setSemaine] = useState("");
  const [lundi, setLundi] = useState<string>(lundiCourant());
  const [textes, setTextes] = useState<TexteEleve[]>([]);
  const [correctionEnCours, setCorrectionEnCours] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        const r = typeof window !== "undefined" ? sessionStorage.getItem("pb_role") : null;
        if (r === "enseignant") return;
        router.push("/enseignant");
        return;
      }
      setLoading(true);
      fetch(`/api/ecriture/textes-finaux?semaine=${lundi}`)
        .then((r) => r.json())
        .then((data) => {
          setSujet(data.sujet ?? "");
          setContrainte(data.contrainte ?? "");
          setSemaine(data.semaine ?? "");
          setTextes(data.textes ?? []);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    });
  }, [router, supabase, lundi]);

  const lundiAujourd_hui = lundiCourant();
  const estSemaineCourante = lundi === lundiAujourd_hui;

  function nbMots(txt: string): number {
    return txt.trim() ? txt.trim().split(/\s+/).length : 0;
  }

  /** Remplace les ** ** par <strong> pour le rendu HTML, en échappant le reste. */
  function rendreTexteCorrige(src: string): string {
    // On échappe d'abord le HTML, puis on re-transforme **...** en <strong>
    const esc = src
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return esc.replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#B91C1C;">$1</strong>');
  }

  async function corrigerTous() {
    const actifs = textes.filter((t) => (t.texteFinal || t.texteCourant).trim().length > 0);
    if (actifs.length === 0) return;
    setCorrectionEnCours(true);
    try {
      const res = await fetch("/api/enseignant/ecriture/corriger-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blocs: actifs.map((t) => ({
            id: t.id,
            prenom: t.prenom,
            texte: t.texteFinal || t.texteCourant,
          })),
        }),
      });
      if (!res.ok) {
        alert("La correction IA a échoué.");
        setCorrectionEnCours(false);
        return;
      }
      const { resultats } = (await res.json()) as {
        resultats: Array<{
          id: string;
          prenom: string;
          texteCorrige: string;
          nbCorrections: number;
          nbMotsOrigine: number;
          pourcentageJuste: number;
        }>;
      };
      // Construit le PDF
      const parId = new Map(resultats.map((r) => [r.id, r]));
      const items = actifs.map((t) => {
        const r = parId.get(t.id);
        const texteAffiche = r ? r.texteCorrige : t.texteFinal || t.texteCourant;
        const badge = r
          ? `<span style="font-size: 12px; color: ${r.pourcentageJuste >= 90 ? "#059669" : r.pourcentageJuste >= 70 ? "#B45309" : "#B91C1C"}; font-weight: 700; margin-left: 8px;">${r.pourcentageJuste}% · ${r.nbCorrections} correction${r.nbCorrections > 1 ? "s" : ""}</span>`
          : "";
        return `
          <div style="padding: 16px 0; page-break-inside: avoid;">
            <div style="display: flex; align-items: baseline; gap: 12px; margin-bottom: 6px; flex-wrap: wrap;">
              <h3 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 16px; font-weight: 800; margin: 0;">${t.prenom} ${t.nom}</h3>
              <span style="font-size: 12px; color: #888;">${t.classe}</span>
              ${badge}
            </div>
            <div style="font-size: 13px; line-height: 1.8; white-space: pre-wrap; padding-left: 12px; border-left: 3px solid #7C3AED;">${rendreTexteCorrige(texteAffiche)}</div>
          </div>
        `;
      });
      const content = items.join('<hr style="border: none; border-top: 1px solid #ddd; margin: 8px 0;">');

      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.left = "-9999px";
      iframe.style.width = "0";
      iframe.style.height = "0";
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
      if (!doc) { setCorrectionEnCours(false); return; }
      doc.open();
      doc.write(`
        <html><head><title>Textes corrigés — Atelier d'écriture</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700;800&family=Manrope:wght@400;600&display=swap');
          body { font-family: 'Manrope', sans-serif; padding: 40px; color: #222; }
          @page { size: A4; margin: 15mm 20mm; }
        </style></head><body>
        <div style="margin-bottom: 20px; border-bottom: 2px solid #7C3AED; padding-bottom: 12px;">
          <h1 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 20px; margin: 0 0 4px;">Atelier d'écriture — ${semaine} — Version corrigée</h1>
          <p style="font-size: 13px; color: #555; margin: 0;"><strong>Sujet :</strong> ${sujet}</p>
          <p style="font-size: 12px; color: #777; margin: 6px 0 0;">Les mots en <strong style="color:#B91C1C;">rouge gras</strong> ont été corrigés par l'IA.</p>
        </div>
        ${content}
        </body></html>
      `);
      doc.close();
      iframe.onload = () => {
        setTimeout(() => {
          iframe.contentWindow?.print();
          setTimeout(() => document.body.removeChild(iframe), 1000);
        }, 300);
      };
    } catch {
      alert("Erreur réseau lors de la correction.");
    }
    setCorrectionEnCours(false);
  }

  function imprimerTous() {
    const items = textes
      .filter((t) => (t.texteFinal || t.texteCourant).trim().length > 0)
      .map((t) => `
        <div style="padding: 16px 0; page-break-inside: avoid;">
          <div style="display: flex; align-items: baseline; gap: 12px; margin-bottom: 6px;">
            <h3 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 16px; font-weight: 800; margin: 0;">${t.prenom} ${t.nom}</h3>
            <span style="font-size: 12px; color: #888;">${t.classe}</span>
          </div>
          <div style="font-size: 13px; line-height: 1.8; white-space: pre-wrap; padding-left: 12px; border-left: 3px solid #7C3AED;">${t.texteFinal || t.texteCourant}</div>
        </div>
      `);
    const content = items.join('<hr style="border: none; border-top: 1px solid #ddd; margin: 8px 0;">');

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-9999px";
    iframe.style.width = "0";
    iframe.style.height = "0";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(`
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
    doc.close();
    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
      }, 300);
    };
  }

  if (loading) {
    return <div className="skeleton" style={{ height: 200, borderRadius: 16 }} />;
  }

  const finalises = textes.filter((t) => t.dateEnvoi !== null && t.texteFinal.trim().length > 0).length;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 className="ens-page-title" style={{ marginBottom: 4 }}>Atelier d&apos;écriture</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
            <button
              type="button"
              onClick={() => setLundi(decalerLundi(lundi, -1))}
              title="Semaine précédente"
              aria-label="Semaine précédente"
              style={{
                background: "none", border: "1px solid var(--pb-outline-variant, #ddd)",
                borderRadius: 8, padding: "2px 8px", cursor: "pointer",
                display: "inline-flex", alignItems: "center",
              }}
            >
              <span className="ms" style={{ fontSize: 18 }}>chevron_left</span>
            </button>
            <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", margin: 0, minWidth: 0 }}>
              Semaine du {semaine || "…"}{estSemaineCourante ? " (en cours)" : ""} — {textes.length} élève{textes.length > 1 ? "s" : ""} · {finalises} envoyé{finalises > 1 ? "s" : ""}
            </p>
            <button
              type="button"
              onClick={() => setLundi(decalerLundi(lundi, 1))}
              disabled={estSemaineCourante}
              title="Semaine suivante"
              aria-label="Semaine suivante"
              style={{
                background: "none", border: "1px solid var(--pb-outline-variant, #ddd)",
                borderRadius: 8, padding: "2px 8px",
                cursor: estSemaineCourante ? "not-allowed" : "pointer",
                opacity: estSemaineCourante ? 0.4 : 1,
                display: "inline-flex", alignItems: "center",
              }}
            >
              <span className="ms" style={{ fontSize: 18 }}>chevron_right</span>
            </button>
            {!estSemaineCourante && (
              <button
                type="button"
                onClick={() => setLundi(lundiAujourd_hui)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 12, color: "var(--pb-primary)", fontWeight: 600,
                  padding: "2px 6px",
                }}
              >
                Aujourd&apos;hui
              </button>
            )}
          </div>
        </div>
        {textes.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
            <button className="btn-primary-sm" onClick={imprimerTous}>
              <span className="ms" style={{ fontSize: 18 }}>print</span>
              Imprimer tous les textes
            </button>
            <button
              className="btn-primary-sm"
              onClick={corrigerTous}
              disabled={correctionEnCours}
              style={{
                background: "linear-gradient(135deg, #7C3AED, #4338CA)",
                opacity: correctionEnCours ? 0.6 : 1,
                cursor: correctionEnCours ? "not-allowed" : "pointer",
              }}
            >
              <span className="ms" style={{ fontSize: 18 }}>auto_fix_high</span>
              {correctionEnCours ? "Correction en cours…" : "Corriger tous les textes"}
            </button>
          </div>
        )}
      </div>

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
          {contrainte && (
            <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", margin: "6px 0 0" }}>
              <strong>Contrainte :</strong> {contrainte}
            </p>
          )}
        </div>
      )}

      {textes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--pb-on-surface-variant)" }}>
          <span className="ms" style={{ fontSize: 48, display: "block", marginBottom: 12, opacity: 0.3 }}>edit_note</span>
          <p style={{ fontWeight: 600 }}>
            {estSemaineCourante ? "Aucun atelier d'écriture cette semaine" : "Aucun atelier d'écriture pour cette semaine"}
          </p>
          {estSemaineCourante && (
            <p style={{ fontSize: 13 }}>Activez le mode semaine et affectez un thème pour commencer.</p>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {textes.map((t) => {
            const texte = t.texteFinal || t.texteCourant;
            const mots = nbMots(texte);
            const envoye = !!t.dateEnvoi && t.texteFinal.trim().length > 0;

            return (
              <Link
                key={t.id}
                href={`/enseignant/atelier-ecriture/${t.id}`}
                style={{
                  display: "flex", alignItems: "center", gap: 16,
                  padding: "14px 20px", borderRadius: 14, cursor: "pointer",
                  background: envoye ? "#f0fdf4" : "white",
                  border: `1.5px solid ${envoye ? "#BBF7D0" : "var(--pb-outline-variant, #ddd)"}`,
                  transition: "box-shadow 0.15s",
                  textDecoration: "none", color: "inherit",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
              >
                <span className="ms" style={{ fontSize: 24, color: envoye ? "#16A34A" : "var(--pb-on-surface-variant)", flexShrink: 0 }}>
                  {envoye ? "check_circle" : "edit_note"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 15, color: "var(--pb-on-surface)" }}>
                    {t.prenom} {t.nom}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)" }}>
                    {t.classe} — {mots > 0 ? `${mots} mots` : "pas encore commencé"}
                    {t.nbAnnotations > 0 && (
                      <> · <span style={{ color: "#4338CA", fontWeight: 600 }}>{t.nbAnnotations} annotation{t.nbAnnotations > 1 ? "s" : ""}</span></>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {t.nbAnnotationsNouvelles > 0 && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                      background: "#EEF2FF", color: "#4338CA",
                    }}>
                      {t.nbAnnotationsNouvelles} en attente
                    </span>
                  )}
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999,
                    background: envoye ? "#DCFCE7" : "#F3F4F6",
                    color: envoye ? "#166534" : "#6B7280",
                  }}>
                    {envoye ? "Envoyé" : t.statut === "en_cours" ? "En cours" : "À faire"}
                  </span>
                  <span className="ms" style={{ fontSize: 18, color: "var(--pb-on-surface-variant)" }}>chevron_right</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
