"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase";

// ── Types ────────────────────────────────────────────────────────────────────

interface Eleve {
  uid: string;       // "pb_UUID" ou "rb_N"
  prenom: string;
  nom: string;
  source: "planbox" | "repetibox";
  niveaux?: { nom: string } | null;
}

interface Chapitre {
  id: string;
  titre: string;
  matiere: string;
  sous_matiere: string | null;
  niveau_id: string;
  ordre: number | null;
}

interface ProgressionData {
  eleve_uid: string;   // "pb_UUID" ou "rb_N"
  chapitre_id: string;
  pourcentage: number;
  statut: "en_cours" | "valide" | "remediation";
  updated_at: string;
}

interface Groupe {
  id: string;
  nom: string;
}

interface Membership {
  groupe_id: string;
  eleve_uid: string;   // "pb_UUID" ou "rb_N"
}

interface CellDetail {
  blocs: Array<{
    id: string;
    titre: string;
    type: string;
    statut: string;
    contenu: Record<string, unknown> | null;
    date_assignation: string;
    date_limite: string | null;
  }>;
  progression: ProgressionData | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const COULEURS_MATIERE: Record<string, { bg: string; texte: string; border: string; icone: string }> = {
  français:       { bg: "#DBEAFE", texte: "#1E40AF", border: "#93C5FD", icone: "📖" },
  maths:          { bg: "#D1FAE5", texte: "#065F46", border: "#6EE7B7", icone: "🔢" },
  sciences:       { bg: "#FEF3C7", texte: "#92400E", border: "#FCD34D", icone: "🔬" },
  "histoire-géo": { bg: "#EDE9FE", texte: "#5B21B6", border: "#C4B5FD", icone: "🌍" },
  anglais:        { bg: "#FCE7F3", texte: "#9D174D", border: "#F9A8D4", icone: "🇬🇧" },
  EMC:            { bg: "#F0FDF4", texte: "#166534", border: "#86EFAC", icone: "⚖️" },
};

const COULEUR_STATUT: Record<string, { bg: string; texte: string; border: string }> = {
  valide:     { bg: "#DCFCE7", texte: "#16A34A", border: "#BBF7D0" },
  en_cours:   { bg: "#DBEAFE", texte: "#2563EB", border: "#BFDBFE" },
  remediation:{ bg: "#FEF3C7", texte: "#D97706", border: "#FDE68A" },
  absent:     { bg: "#F1F5F9", texte: "#94A3B8", border: "#E2E8F0" },
};

function scoreBloc(contenu: Record<string, unknown> | null): string | null {
  if (!contenu) return null;
  const se = Number(contenu.score_eleve);
  const st = Number(contenu.score_total);
  if (!isNaN(se) && !isNaN(st) && st > 0) return `${se}/${st}`;
  return null;
}

const TYPE_ICONE: Record<string, string> = {
  exercice: "edit_note", calcul_mental: "pin", mots: "abc", dictee: "headphones",
  eval: "quiz", ressource: "open_in_new", libre: "edit", media: "play_circle",
};

// Grouper les chapitres par sous_matiere
interface SousMatiereGroupe {
  nom: string | null; // null = pas de sous-matière
  label: string;
  chapitres: Chapitre[];
}

function grouperParSousMatiere(chapitres: Chapitre[]): SousMatiereGroupe[] {
  const map = new Map<string, Chapitre[]>();
  const ordreAppearance: string[] = [];

  for (const c of chapitres) {
    const key = c.sous_matiere ?? "__general__";
    if (!map.has(key)) {
      map.set(key, []);
      ordreAppearance.push(key);
    }
    map.get(key)!.push(c);
  }

  return ordreAppearance.map((key) => ({
    nom: key === "__general__" ? null : key,
    label: key === "__general__" ? "Général" : key,
    chapitres: map.get(key)!,
  }));
}

// ── Composant ────────────────────────────────────────────────────────────────

export default function ProgressionElevesView() {
  const [eleves, setEleves]           = useState<Eleve[]>([]);
  const [chapitres, setChapitres]     = useState<Chapitre[]>([]);
  const [progressions, setProgressions] = useState<ProgressionData[]>([]);
  const [groupes, setGroupes]         = useState<Groupe[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [chargement, setChargement]   = useState(true);

  const [filtreMatiere, setFiltreMatiere] = useState<string | null>(null);
  const [filtreGroupe, setFiltreGroupe]   = useState("tous");

  const [cellule, setCellule]  = useState<{ eleveId: string; chapitreId: string } | null>(null);
  const [detail, setDetail]    = useState<CellDetail | null>(null);
  const [loadDetail, setLoadDetail] = useState(false);
  const [enRappel, setEnRappel] = useState(false);

  const [sectionsOuvertes, setSectionsOuvertes] = useState<Set<string>>(new Set());

  const tableRef = useRef<HTMLDivElement>(null);

  // ── Chargement données ───────────────────────────────────────────────────
  const charger = useCallback(async () => {
    const res = await fetch("/api/admin/progression");
    if (!res.ok) { setChargement(false); return; }
    const json = await res.json();
    setEleves(json.eleves ?? []);
    setChapitres(json.chapitres ?? []);
    setProgressions(json.progressions ?? []);
    setGroupes(json.groupes ?? []);
    setMemberships(json.memberships ?? []);
    setChargement(false);
  }, []);

  useEffect(() => { charger(); }, [charger]);

  // Polling 30s
  useEffect(() => {
    const id = setInterval(charger, 30_000);
    return () => clearInterval(id);
  }, [charger]);

  // Realtime pb_progression
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("progression_eleves_v2")
      .on("postgres_changes", { event: "*", schema: "public", table: "pb_progression" }, charger)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [charger]);

  // Auto-sélection première matière
  useEffect(() => {
    if (filtreMatiere === null && chapitres.length > 0) {
      const matieres = [...new Set(chapitres.map((c) => c.matiere))];
      if (matieres.length > 0) {
        setFiltreMatiere(matieres[0]);
      }
    }
  }, [chapitres, filtreMatiere]);

  // Ouvrir toutes les sections par défaut au changement de matière
  useEffect(() => {
    if (!filtreMatiere) return;
    const chapsFiltres = chapitres.filter((c) => c.matiere === filtreMatiere);
    const groupes = grouperParSousMatiere(chapsFiltres);
    setSectionsOuvertes(new Set(groupes.map((g) => g.label)));
  }, [filtreMatiere, chapitres]);

  // ── Détail cellule ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!cellule) { setDetail(null); return; }
    setLoadDetail(true);
    fetch(`/api/admin/progression?eleveId=${cellule.eleveId}&chapitreId=${cellule.chapitreId}`)
      .then((r) => r.json())
      .then((j) => { setDetail(j); setLoadDetail(false); })
      .catch(() => setLoadDetail(false));
  }, [cellule]);

  // ── Filtres ─────────────────────────────────────────────────────────────
  const elevesGroupe: string[] | null =
    filtreGroupe === "tous"
      ? null
      : memberships.filter((m) => m.groupe_id === filtreGroupe).map((m) => m.eleve_uid);

  const elevesFiltres = eleves.filter((e) =>
    elevesGroupe === null || elevesGroupe.includes(e.uid)
  );

  // Chapitres de la matière sélectionnée
  const chapitresMatiere = chapitres.filter((c) =>
    filtreMatiere ? c.matiere === filtreMatiere : false
  );

  // Grouper par sous-matière
  const sousGroupes = grouperParSousMatiere(chapitresMatiere);

  // Matières disponibles (avec au moins un chapitre)
  const matieresDisponibles = [...new Set(chapitres.map((c) => c.matiere))];

  // Map de lookup progression
  const progMap = new Map<string, ProgressionData>();
  progressions.forEach((p) => progMap.set(`${p.eleve_uid}__${p.chapitre_id}`, p));

  // Stats par élève pour la matière courante
  function statsEleve(uid: string) {
    let total = 0;
    let valides = 0;
    let enCours = 0;
    for (const c of chapitresMatiere) {
      const prog = progMap.get(`${uid}__${c.id}`);
      if (prog) {
        total++;
        if (prog.statut === "valide") valides++;
        else if (prog.statut === "en_cours") enCours++;
      }
    }
    return { total, valides, enCours };
  }

  // Drawer data
  const eleveDrawer   = cellule ? eleves.find((e) => e.uid === cellule.eleveId) : null;
  const chapDrawer    = cellule ? chapitres.find((c) => c.id === cellule.chapitreId) : null;
  const progDrawer    = cellule ? progMap.get(`${cellule.eleveId}__${cellule.chapitreId}`) : null;

  // Toggle section
  function toggleSection(label: string) {
    setSectionsOuvertes((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  // ── Action "Envoyer rappel" ──────────────────────────────────────────────
  async function envoyerRappel() {
    if (!cellule || !eleveDrawer || !chapDrawer) return;
    setEnRappel(true);
    await fetch("/api/admin/envoyer-rappel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eleveId: cellule.eleveId,
        chapitreId: cellule.chapitreId,
        message: `👋 ${eleveDrawer.prenom}, pense à travailler "${chapDrawer.titre}" !`,
      }),
    });
    setEnRappel(false);
    setCellule(null);
  }

  // ── Rendu ────────────────────────────────────────────────────────────────

  if (chargement) {
    return (
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton" style={{ height: 44, borderRadius: 8 }} />
        ))}
      </div>
    );
  }

  if (elevesFiltres.length === 0) {
    return (
      <div style={{ padding: 40, color: "var(--text-secondary)", fontSize: 14, textAlign: "center" }}>
        Aucun élève dans ce groupe.
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>

      {/* ── Filtres ── */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        {/* Filtre matière — boutons avec icônes */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {matieresDisponibles.map((m) => {
            const cfg = COULEURS_MATIERE[m] ?? { bg: "#F3F4F6", texte: "#374151", border: "#D1D5DB", icone: "📚" };
            const actif = filtreMatiere === m;
            return (
              <button
                key={m}
                onClick={() => setFiltreMatiere(m)}
                style={{
                  padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                  fontWeight: actif ? 800 : 600,
                  background: actif ? cfg.bg : "var(--white)",
                  color: actif ? cfg.texte : "var(--text-secondary)",
                  border: actif ? `2px solid ${cfg.border}` : "1px solid var(--border)",
                  display: "flex", alignItems: "center", gap: 5,
                  transition: "all 0.15s",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                <span style={{ fontSize: 13 }}>{cfg.icone}</span>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            );
          })}
        </div>

        {/* Filtre groupe */}
        {groupes.length > 0 && (
          <select
            value={filtreGroupe}
            onChange={(e) => setFiltreGroupe(e.target.value)}
            className="form-input"
            style={{ padding: "4px 10px", fontSize: 12, width: "auto" }}
          >
            <option value="tous">Tous les groupes</option>
            {groupes.map((g) => (
              <option key={g.id} value={g.id}>{g.nom}</option>
            ))}
          </select>
        )}
      </div>

      {/* ── Contenu par sous-matière ── */}
      <div style={{ padding: "12px 16px 20px" }}>
        {sousGroupes.length === 0 ? (
          <div style={{ padding: 32, color: "var(--text-secondary)", fontSize: 14, textAlign: "center" }}>
            Aucun chapitre pour cette matière.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {sousGroupes.map((groupe) => {
              const ouvert = sectionsOuvertes.has(groupe.label);
              const cfg = COULEURS_MATIERE[filtreMatiere ?? ""] ?? { bg: "#F3F4F6", texte: "#374151", border: "#D1D5DB", icone: "📚" };

              // Stats globales de la sous-matière
              let totalValides = 0;
              let totalEleves = 0;
              for (const eleve of elevesFiltres) {
                for (const chap of groupe.chapitres) {
                  const prog = progMap.get(`${eleve.uid}__${chap.id}`);
                  if (prog?.statut === "valide") totalValides++;
                }
                totalEleves++;
              }
              const potentiel = totalEleves * groupe.chapitres.length;
              const tauxGlobal = potentiel > 0 ? Math.round((totalValides / potentiel) * 100) : 0;

              return (
                <div
                  key={groupe.label}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 16,
                    overflow: "hidden",
                    background: "var(--white)",
                  }}
                >
                  {/* En-tête sous-matière */}
                  <button
                    onClick={() => toggleSection(groupe.label)}
                    style={{
                      width: "100%",
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "12px 16px",
                      background: ouvert ? `${cfg.bg}80` : "var(--bg)",
                      border: "none",
                      borderBottom: ouvert ? "1px solid var(--border)" : "none",
                      cursor: "pointer",
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      transition: "background 0.15s",
                    }}
                  >
                    <span className="ms" style={{ fontSize: 18, color: cfg.texte, transition: "transform 0.2s", transform: ouvert ? "rotate(0deg)" : "rotate(-90deg)" }}>
                      expand_more
                    </span>
                    <span style={{ fontWeight: 800, fontSize: 14, color: cfg.texte }}>
                      {groupe.label}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>
                      {groupe.chapitres.length} chapitre{groupe.chapitres.length > 1 ? "s" : ""}
                    </span>
                    {/* Jauge de progression globale */}
                    <div style={{ flex: 1 }} />
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 60, height: 6, borderRadius: 3, background: "#E5E7EB", overflow: "hidden" }}>
                        <div style={{ width: `${tauxGlobal}%`, height: "100%", borderRadius: 3, background: tauxGlobal >= 80 ? "#16A34A" : tauxGlobal >= 40 ? "#2563EB" : "#D97706", transition: "width 0.3s" }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", minWidth: 32, textAlign: "right" }}>
                        {tauxGlobal}%
                      </span>
                    </div>
                  </button>

                  {/* Tableau des chapitres */}
                  {ouvert && (
                    <div ref={tableRef} style={{ overflowX: "auto" }}>
                      <table style={{ borderCollapse: "collapse", minWidth: "100%", fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th style={{
                              textAlign: "left", fontWeight: 700, fontSize: 11, padding: "8px 12px 8px 16px",
                              position: "sticky", left: 0, background: "var(--white)", zIndex: 2,
                              borderBottom: "2px solid var(--border)", whiteSpace: "nowrap",
                              color: "var(--text-secondary)",
                            }}>
                              Élève
                            </th>
                            {groupe.chapitres.map((c) => (
                              <th
                                key={c.id}
                                style={{
                                  textAlign: "center", fontWeight: 600, fontSize: 11, padding: "8px 6px",
                                  borderBottom: "2px solid var(--border)",
                                  color: "var(--text-secondary)", minWidth: 70,
                                  maxWidth: 140, whiteSpace: "normal", wordBreak: "break-word",
                                  verticalAlign: "bottom", lineHeight: 1.3,
                                }}
                              >
                                {c.titre}
                              </th>
                            ))}
                            {/* Colonne résumé */}
                            <th style={{
                              textAlign: "center", fontWeight: 700, fontSize: 11, padding: "8px 12px",
                              borderBottom: "2px solid var(--border)", borderLeft: "2px solid var(--border)",
                              color: cfg.texte, whiteSpace: "nowrap", minWidth: 60,
                            }}>
                              Validés
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {elevesFiltres.map((eleve) => {
                            const nbValides = groupe.chapitres.filter((c) => {
                              const prog = progMap.get(`${eleve.uid}__${c.id}`);
                              return prog?.statut === "valide";
                            }).length;

                            return (
                              <tr key={eleve.uid} style={{ borderBottom: "1px solid var(--border)" }}>
                                <td style={{
                                  padding: "6px 12px 6px 16px", fontWeight: 600, fontSize: 13,
                                  position: "sticky", left: 0, background: "var(--white)", zIndex: 1,
                                  whiteSpace: "nowrap",
                                }}>
                                  {eleve.prenom} {eleve.nom.charAt(0)}.
                                  {eleve.niveaux && (
                                    <span style={{ fontSize: 10, marginLeft: 5, color: "var(--text-secondary)", fontWeight: 400 }}>
                                      {eleve.niveaux.nom}
                                    </span>
                                  )}
                                  {eleve.source === "repetibox" && (
                                    <span style={{ fontSize: 9, marginLeft: 4, color: "#7C3AED", fontWeight: 700 }}>RB</span>
                                  )}
                                </td>

                                {groupe.chapitres.map((chap) => {
                                  const cle = `${eleve.uid}__${chap.id}`;
                                  const prog = progMap.get(cle);
                                  const estSelectionne = cellule?.eleveId === eleve.uid && cellule?.chapitreId === chap.id;
                                  const cfgStatut = prog ? COULEUR_STATUT[prog.statut] : COULEUR_STATUT.absent;

                                  return (
                                    <td key={chap.id} style={{ textAlign: "center", padding: "3px" }}>
                                      <button
                                        title={prog ? `${prog.statut} — ${prog.pourcentage}%` : "Non commencé"}
                                        onClick={() => setCellule(estSelectionne ? null : { eleveId: eleve.uid, chapitreId: chap.id })}
                                        style={{
                                          width: 36, height: 36, borderRadius: "50%",
                                          border: `2px solid ${estSelectionne ? "var(--primary)" : cfgStatut.border}`,
                                          background: estSelectionne ? "var(--primary)" : cfgStatut.bg,
                                          color: estSelectionne ? "white" : cfgStatut.texte,
                                          fontWeight: 700, fontSize: prog?.statut === "valide" ? 13 : 9,
                                          cursor: "pointer", display: "inline-flex",
                                          alignItems: "center", justifyContent: "center",
                                          lineHeight: 1, transition: "all 0.12s",
                                          outline: "none",
                                        }}
                                      >
                                        {!prog && "—"}
                                        {prog?.statut === "valide" && "✓"}
                                        {prog?.statut === "en_cours" && `${prog.pourcentage}%`}
                                        {prog?.statut === "remediation" && "🔁"}
                                      </button>
                                    </td>
                                  );
                                })}

                                {/* Colonne résumé */}
                                <td style={{
                                  textAlign: "center", padding: "3px 8px",
                                  borderLeft: "2px solid var(--border)",
                                  fontWeight: 800, fontSize: 13,
                                  color: nbValides === groupe.chapitres.length && nbValides > 0
                                    ? "#16A34A"
                                    : nbValides > 0
                                    ? cfg.texte
                                    : "var(--text-secondary)",
                                }}>
                                  {nbValides}/{groupe.chapitres.length}
                                  {nbValides === groupe.chapitres.length && nbValides > 0 && (
                                    <span style={{ marginLeft: 3, fontSize: 12 }}>🏆</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Légende ── */}
      <div style={{ padding: "0 16px 12px", display: "flex", gap: 14, flexWrap: "wrap" }}>
        {[
          { cle: "absent",     label: "—  Non commencé" },
          { cle: "en_cours",   label: "45%  En cours" },
          { cle: "valide",     label: "✓  Validé" },
          { cle: "remediation",label: "🔁  Remédiation" },
        ].map(({ cle, label }) => {
          const cfgS = COULEUR_STATUT[cle];
          return (
            <div key={cle} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)" }}>
              <div style={{ width: 16, height: 16, borderRadius: "50%", background: cfgS.bg, border: `2px solid ${cfgS.border}` }} />
              {label}
            </div>
          );
        })}
      </div>

      {/* ── Drawer détail ── */}
      {cellule && (
        <>
          <div
            onClick={() => setCellule(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.2)", zIndex: 100 }}
          />

          <div style={{
            position: "fixed", top: 0, right: 0, bottom: 0, width: 340,
            background: "var(--white)", borderLeft: "1px solid var(--border)",
            boxShadow: "-4px 0 20px rgba(0,0,0,0.1)", zIndex: 101,
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            {/* En-tête */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text)" }}>
                    {eleveDrawer?.prenom} {eleveDrawer?.nom}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                    {chapDrawer?.titre}
                  </div>
                  {chapDrawer?.sous_matiere && (
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 1, fontStyle: "italic" }}>
                      {chapDrawer.matiere} › {chapDrawer.sous_matiere}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setCellule(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-secondary)", padding: "0 0 0 8px" }}
                >
                  ✕
                </button>
              </div>

              {progDrawer && (
                <div style={{ marginTop: 10 }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                    background: COULEUR_STATUT[progDrawer.statut].bg,
                    color: COULEUR_STATUT[progDrawer.statut].texte,
                    border: `1px solid ${COULEUR_STATUT[progDrawer.statut].border}`,
                  }}>
                    {progDrawer.statut === "valide" && "✓ Validé"}
                    {progDrawer.statut === "en_cours" && `En cours — ${progDrawer.pourcentage}%`}
                    {progDrawer.statut === "remediation" && "🔁 Remédiation"}
                  </span>
                  {progDrawer.statut === "valide" && (
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 5 }}>
                      Validé le {new Date(progDrawer.updated_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Liste des blocs */}
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
              {loadDetail ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 52, borderRadius: 8 }} />)}
                </div>
              ) : !detail || detail.blocs.length === 0 ? (
                <div style={{ color: "var(--text-secondary)", fontSize: 13, textAlign: "center", padding: 24 }}>
                  Aucune activité assignée pour ce chapitre.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {detail.blocs.map((bloc) => {
                    const score = scoreBloc(bloc.contenu);
                    const icone = TYPE_ICONE[bloc.type] ?? "assignment";
                    const couleurStatut = bloc.statut === "fait" ? "#16A34A" : bloc.statut === "en_cours" ? "#2563EB" : "#9CA3AF";
                    return (
                      <div
                        key={bloc.id}
                        style={{
                          padding: "10px 12px", borderRadius: 8,
                          border: "1px solid var(--border)", background: "var(--bg)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: score ? 4 : 0 }}>
                          <span className="ms" style={{ fontSize: 14 }}>{icone}</span>
                          <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {bloc.titre}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: couleurStatut, whiteSpace: "nowrap" }}>
                            {bloc.statut === "fait" ? <><span className="ms" style={{ fontSize: 11, verticalAlign: "middle" }}>check</span> Fait</> : bloc.statut === "en_cours" ? "En cours" : "À faire"}
                          </span>
                        </div>
                        {score && (
                          <div style={{ fontSize: 11, color: "var(--text-secondary)", paddingLeft: 22 }}>
                            Score : {score}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pied — Envoyer rappel */}
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
              <button
                onClick={envoyerRappel}
                disabled={enRappel}
                className="btn-secondary"
                style={{ width: "100%", justifyContent: "center" }}
              >
                {enRappel ? "Envoi…" : <><span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>send</span> Envoyer un rappel</>}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
