"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { lundiDeSemaine, semaineISO } from "@/lib/semaine-iso";

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

interface TexteDuJour {
  id: string;
  prenom: string;
  nom: string;
  statut: string;
  texte: string;
  nbCorrections: number;
  nbAnnotations: number;
}

interface JourEcriture {
  date: string;
  sujet: string;
  textes: TexteDuJour[];
}

// `toISOString()` sur une date locale reculait d'un jour le lundi peu après
// minuit (piège nº 7) : la semaine se calcule en UTC.
function lundiCourant(): string {
  return lundiDeSemaine(semaineISO());
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
  // La semaine peut venir de l'URL : c'est ainsi que le retour depuis la page
  // de relecture ramène à la semaine qu'on consultait.
  const [lundi, setLundi] = useState<string>(() => {
    if (typeof window === "undefined") return lundiCourant();
    const s = new URLSearchParams(window.location.search).get("semaine");
    return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : lundiCourant();
  });
  const [textes, setTextes] = useState<TexteEleve[]>([]);
  const [correctionEnCours, setCorrectionEnCours] = useState(false);
  const [joursDuJour, setJoursDuJour] = useState<JourEcriture[]>([]);

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
      // Les textes du jour, lus à part : leur liste ne doit pas retarder
      // celle de l'atelier de la semaine.
      fetch(`/api/ecriture/textes-du-jour?semaine=${lundi}`)
        .then((r) => r.json())
        .then((data) => setJoursDuJour(data.jours ?? []))
        .catch(() => setJoursDuJour([]));
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

      <TextesDuJour jours={joursDuJour} nbMots={nbMots} lundi={lundi} />
    </>
  );
}

/* ── Les textes du jour ───────────────────────────────────────────────────── */

const JOURS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/**
 * Les textes écrits en mode « jour », jour par jour.
 *
 * Ils n'avaient pas leur place ici : la page ne lisait que l'atelier de la
 * semaine. Un texte du jour ne se retrouvait qu'en ouvrant la matrice du suivi
 * à la bonne date, puis la case du bon élève. Chaque ligne mène à la même
 * page de relecture et d'annotation que l'atelier.
 */
function TextesDuJour({
  jours, nbMots, lundi,
}: { jours: JourEcriture[]; nbMots: (t: string) => number; lundi: string }) {
  // Chaque jour se plie. Ouvert d'office : le jour le plus récent qui a des
  // textes — c'est celui qu'on vient relire. Les autres restent à un clic.
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const [initialise, setInitialise] = useState<string | null>(null);
  const cleSemaine = `${lundi}:${jours.map((j) => j.date).join(",")}`;
  if (jours.length > 0 && initialise !== cleSemaine) {
    const recents = [...jours].reverse();
    const defaut = recents.find((j) => j.textes.some((t) => t.texte)) ?? recents[0];
    setOuverts(new Set([defaut.date]));
    setInitialise(cleSemaine);
  }
  function basculer(date: string) {
    setOuverts((prev) => {
      const n = new Set(prev);
      if (n.has(date)) n.delete(date); else n.add(date);
      return n;
    });
  }

  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{
        fontSize: 16, fontWeight: 800, margin: "0 0 4px",
        fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface)",
      }}>
        Textes du jour
      </h2>
      <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", margin: "0 0 14px" }}>
        Les textes écrits en une journée, hors atelier de la semaine.
      </p>

      {jours.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", padding: "12px 0" }}>
          Aucun texte du jour cette semaine.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {jours.map((j) => {
            const d = new Date(`${j.date}T12:00:00`);
            const titre = `${JOURS_FR[d.getDay()]} ${d.getDate()} ${d.toLocaleDateString("fr-FR", { month: "long" })}`;
            const ecrits = j.textes.filter((t) => t.texte).length;
            const ouvert = ouverts.has(j.date);
            return (
              <div key={j.date}>
                <button
                  type="button"
                  onClick={() => basculer(j.date)}
                  aria-expanded={ouvert}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 8, width: "100%",
                    background: "none", border: "none", padding: 0, marginBottom: ouvert ? 8 : 0,
                    cursor: "pointer", textAlign: "left", font: "inherit", color: "inherit",
                  }}
                >
                  <span className="ms" style={{
                    fontSize: 20, color: "var(--pb-on-surface-variant)", marginTop: -1,
                    transform: ouvert ? "rotate(90deg)" : "none", transition: "transform .15s",
                  }}>chevron_right</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "var(--pb-on-surface)" }}>
                      <span style={{ textTransform: "capitalize" }}>{titre}</span>
                      <span style={{ fontWeight: 500, fontSize: 12, color: "var(--pb-on-surface-variant)" }}>
                        {" "}· {ecrits} texte{ecrits > 1 ? "s" : ""} sur {j.textes.length}
                      </span>
                    </span>
                    {j.sujet && (
                      <span style={{ display: "block", margin: "2px 0 0", fontSize: 12, color: "var(--pb-on-surface-variant)", lineHeight: 1.45 }}>
                        {j.sujet.length > 160 ? j.sujet.slice(0, 160) + "…" : j.sujet}
                      </span>
                    )}
                  </span>
                </button>

                {ouvert && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 28 }}>
                  {j.textes.map((t) => {
                    const mots = nbMots(t.texte);
                    const fait = t.statut === "fait";
                    return (
                      <Link
                        key={t.id}
                        href={`/enseignant/atelier-ecriture/${t.id}?depuis=atelier&semaine=${lundi}`}
                        style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "10px 14px", borderRadius: 12, textDecoration: "none",
                          border: "1px solid var(--pb-outline-variant, #e5e7eb)",
                          background: "var(--pb-surface-lowest, #fff)", color: "inherit",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--pb-on-surface)" }}>
                            {t.prenom} {t.nom}
                          </div>
                          <div style={{
                            fontSize: 12, color: "var(--pb-on-surface-variant)", marginTop: 2,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>
                            {t.texte
                              ? <>{mots} mot{mots > 1 ? "s" : ""} · {t.texte}</>
                              : <em>Pas encore écrit</em>}
                          </div>
                          {(t.nbCorrections > 0 || t.nbAnnotations > 0) && (
                            <div style={{ fontSize: 11, color: "var(--pb-on-surface-variant)", marginTop: 3 }}>
                              {t.nbCorrections > 0 && <>Correction demandée {t.nbCorrections} fois</>}
                              {t.nbCorrections > 0 && t.nbAnnotations > 0 && " · "}
                              {t.nbAnnotations > 0 && (
                                <span style={{ color: "#4338CA", fontWeight: 600 }}>
                                  {t.nbAnnotations} annotation{t.nbAnnotations > 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999, flexShrink: 0,
                          background: fait ? "#DCFCE7" : "#F3F4F6",
                          color: fait ? "#166534" : "#6B7280",
                        }}>
                          {fait ? "Terminé" : t.statut === "en_cours" ? "En cours" : "À faire"}
                        </span>
                        <span className="ms" style={{ fontSize: 18, color: "var(--pb-on-surface-variant)" }}>chevron_right</span>
                      </Link>
                    );
                  })}
                </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
