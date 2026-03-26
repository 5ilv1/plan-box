"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import EnseignantLayout from "@/components/EnseignantLayout";
import AssignationSelector from "@/components/AssignationSelector";
import { AssignationSelecteur } from "@/types";

interface Niveau { id: string; nom: string }
interface Chapitre {
  id: string;
  titre: string;
  matiere: string;
  sous_matiere?: string | null;
  niveau_id: string;
  ordre: number | null;
  description: string | null;
  nb_cartes_eval: number;
  seuil_reussite: number;
  created_at: string;
  niveaux?: Niveau;
}

interface FormState {
  titre: string;
  matiere: string;
  sous_matiere: string;
  niveau_id: string;
  description: string;
  nb_cartes_eval: number;
  seuil_reussite: number;
}

const FORM_VIDE: FormState = {
  titre: "", matiere: "français", sous_matiere: "", niveau_id: "",
  description: "", nb_cartes_eval: 20, seuil_reussite: 90,
};

const MATIERES_SUGGESTIONS = ["français", "maths", "sciences", "histoire-géo", "anglais", "EMC"];
const COULEURS_MATIERE: Record<string, string> = {
  français: "#DBEAFE",
  maths: "#D1FAE5",
  sciences: "#FEF3C7",
  "histoire-géo": "#EDE9FE",
  anglais: "#FCE7F3",
};
const ICONES_MATIERE: Record<string, string> = {
  français: "📖",
  maths: "🔢",
  sciences: "🔬",
  "histoire-géo": "🌍",
  anglais: "🇬🇧",
};

export default function PageAdminChapitres() {
  const router = useRouter();
  const supabase = createClient();

  const [chapitres, setChapitres] = useState<Chapitre[]>([]);
  const [niveaux, setNiveaux] = useState<Niveau[]>([]);
  const [chargement, setChargement] = useState(true);
  const [formVisible, setFormVisible] = useState(false);
  const [chapitreEnEdition, setChapitreEnEdition] = useState<Chapitre | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VIDE);
  const [enSauvegarde, setEnSauvegarde] = useState(false);
  const [erreur, setErreur] = useState("");
  const [aSupprimer, setASupprimer] = useState<string | null>(null);
  const [confirmSuppression, setConfirmSuppression] = useState<{ id: string; erreur: string } | null>(null);
  const [enDuplication, setEnDuplication] = useState<Set<string>>(new Set());

  // ── État modal "Affecter" ───────────────────────────────────────────────
  const ASSIGNATION_VIDE: AssignationSelecteur = { groupeIds: [], eleveUids: [], groupeNoms: [], touteClasse: false };

  interface ExerciceSimple { id: string; type: string; titre: string | null; contenu: unknown; }
  const [chapitreAAffecter, setChapitreAAffecter] = useState<Chapitre | null>(null);
  const [exercicesAffecter, setExercicesAffecter] = useState<ExerciceSimple[]>([]);
  const [assignationAffecter, setAssignationAffecter] = useState<AssignationSelecteur>(ASSIGNATION_VIDE);
  const [dateDebutAffecter, setDateDebutAffecter] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split("T")[0];
  });
  const [etalerJours, setEtalerJours] = useState(true);
  const [enAffectation, setEnAffectation] = useState(false);
  const [erreurAffecter, setErreurAffecter] = useState("");

  // Filtre matière global
  const [filtreMatiere, setFiltreMatiere] = useState<string>("toutes");
  // Filtres sous-matière par accordéon (clé = matière, valeur = sous-matière sélectionnée)
  const [filtreSousParMatiere, setFiltreSousParMatiere] = useState<Record<string, string>>({});
  // Accordéons ouverts (par défaut tout ouvert)
  const [accordeonsOuverts, setAccordeonsOuverts] = useState<Set<string>>(new Set<string>());

  // Drag & drop — inclut la sous-matière pour n'autoriser le glisser qu'au sein d'un même sous-groupe
  const [dragSrc, setDragSrc] = useState<{ matiere: string; sousMatiere: string | null; idx: number } | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { const r = typeof window !== "undefined" ? sessionStorage.getItem("pb_role") : null; if (r === "enseignant") return; router.push("/enseignant"); return; }
      charger();
    });
  }, []);

  async function charger() {
    setChargement(true);
    const [chap, niv] = await Promise.all([
      fetch("/api/admin/chapitres").then((r) => r.json()),
      supabase.from("niveaux").select("*").order("nom"),
    ]);
    const chapitresData: Chapitre[] = chap.chapitres ?? [];
    setChapitres(chapitresData);
    setNiveaux((niv.data ?? []) as Niveau[]);
    const matieres = Array.from(new Set(chapitresData.map(c => c.matiere)));
    setAccordeonsOuverts(new Set(matieres));
    setChargement(false);
  }

  function ouvrirCreation() {
    setChapitreEnEdition(null);
    setForm({ ...FORM_VIDE, niveau_id: niveaux[0]?.id ?? "" });
    setFormVisible(true);
    setErreur("");
  }

  function ouvrirEdition(c: Chapitre) {
    setChapitreEnEdition(c);
    setForm({
      titre: c.titre,
      matiere: c.matiere,
      sous_matiere: c.sous_matiere ?? "",
      niveau_id: c.niveau_id,
      description: c.description ?? "",
      nb_cartes_eval: c.nb_cartes_eval,
      seuil_reussite: c.seuil_reussite,
    });
    setFormVisible(true);
    setErreur("");
  }

  async function sauvegarder() {
    if (!form.titre.trim() || !form.matiere || !form.niveau_id) {
      setErreur("Titre, matière et niveau sont requis.");
      return;
    }
    setEnSauvegarde(true);
    setErreur("");

    const methode = chapitreEnEdition ? "PATCH" : "POST";
    const body = chapitreEnEdition
      ? { id: chapitreEnEdition.id, ...form, sous_matiere: form.sous_matiere || null }
      : { ...form, sous_matiere: form.sous_matiere || null };

    const res = await fetch("/api/admin/chapitres", {
      method: methode,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();

    if (!res.ok) {
      setErreur(json.erreur ?? "Erreur lors de la sauvegarde.");
    } else {
      setFormVisible(false);
      setChapitreEnEdition(null);
      await charger();
    }
    setEnSauvegarde(false);
  }

  async function dupliquerChapitre(c: Chapitre) {
    setEnDuplication(prev => new Set([...prev, c.id]));
    try {
      const res = await fetch("/api/admin/chapitres", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titre: `${c.titre} (copie)`,
          matiere: c.matiere,
          sous_matiere: c.sous_matiere || null,
          niveau_id: c.niveau_id,
          description: c.description || null,
          nb_cartes_eval: c.nb_cartes_eval,
          seuil_reussite: c.seuil_reussite,
        }),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.erreur ?? "Erreur lors de la duplication."); return; }

      const nouveauId = json.chapitre.id;
      const exRes = await fetch(`/api/admin/chapitres/${c.id}/exercices`);
      const exJson = await exRes.json();
      const exercices = (exJson.exercices ?? []) as Array<{
        type: string; matiere: string | null; titre: string | null; contenu: unknown;
      }>;

      if (exercices.length > 0) {
        await Promise.all(exercices.map((ex) =>
          fetch("/api/admin/exercices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: ex.type, matiere: ex.matiere, chapitre_id: nouveauId,
              titre: ex.titre, contenu: ex.contenu, nb_utilisations: 0,
            }),
          })
        ));
      }
      await charger();
    } finally {
      setEnDuplication(prev => { const n = new Set(prev); n.delete(c.id); return n; });
    }
  }

  async function ouvrirAffecter(c: Chapitre) {
    setChapitreAAffecter(c);
    setAssignationAffecter(ASSIGNATION_VIDE);
    setErreurAffecter("");
    const demain = new Date(); demain.setDate(demain.getDate() + 1);
    setDateDebutAffecter(demain.toISOString().split("T")[0]);
    setEtalerJours(true);
    // Charge les exercices du chapitre
    const res = await fetch(`/api/admin/chapitres/${c.id}/exercices`);
    const json = await res.json();
    setExercicesAffecter((json.exercices ?? []) as ExerciceSimple[]);
  }

  async function validerAffectation() {
    if (!chapitreAAffecter) return;
    if (assignationAffecter.groupeIds.length === 0 && assignationAffecter.eleveUids.length === 0) {
      setErreurAffecter("Sélectionne au moins un groupe ou un élève.");
      return;
    }
    if (exercicesAffecter.length === 0) {
      setErreurAffecter("Ce chapitre n'a pas encore d'exercices dans la banque.");
      return;
    }
    setEnAffectation(true);
    setErreurAffecter("");

    const baseDate = new Date(dateDebutAffecter);
    const erreurs: string[] = [];

    for (let i = 0; i < exercicesAffecter.length; i++) {
      const ex = exercicesAffecter[i];
      const dateExo = etalerJours
        ? new Date(baseDate.getTime() + i * 86_400_000).toISOString().split("T")[0]
        : dateDebutAffecter;

      const body: Record<string, unknown> = {
        type: ex.type,
        titre: ex.titre ?? chapitreAAffecter.titre,
        contenu: ex.contenu,
        chapitreId: chapitreAAffecter.id,
        dateAssignation: dateExo,
        periodicite: "jour",
      };
      if (assignationAffecter.groupeIds.length > 0) {
        body.groupeIds = assignationAffecter.groupeIds;
      } else {
        body.eleveUids = assignationAffecter.eleveUids;
      }

      const res = await fetch("/api/affecter-exercice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json();
        erreurs.push(json.erreur ?? `Erreur exercice ${i + 1}`);
      }
    }

    setEnAffectation(false);
    if (erreurs.length > 0) {
      setErreurAffecter(erreurs.join(" | "));
    } else {
      setChapitreAAffecter(null);
    }
  }

  async function supprimer(id: string) {
    const res = await fetch(`/api/admin/chapitres?id=${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      setConfirmSuppression({ id, erreur: json.erreur });
      setASupprimer(null);
    } else {
      setASupprimer(null);
      setConfirmSuppression(null);
      await charger();
    }
  }

  // Réordonne tous les chapitres d'une matière (ordre global)
  async function reordonner(matiere: string, nouvelOrdre: Chapitre[]) {
    setChapitres(prev => {
      const autres = prev.filter(c => c.matiere !== matiere);
      const misAJour = nouvelOrdre.map((c, i) => ({ ...c, ordre: i + 1 }));
      return [...autres, ...misAJour];
    });
    await Promise.all(
      nouvelOrdre.map((c, i) =>
        fetch("/api/admin/chapitres", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: c.id, ordre: i + 1 }),
        })
      )
    );
  }

  // Réordonne uniquement un sous-groupe, en conservant la place des autres sous-groupes
  async function reordonnerSousGroupe(matiere: string, sousMatiere: string | null, nouvelOrdreSubGroup: Chapitre[]) {
    const tousItems = chapitres
      .filter(c => c.matiere === matiere)
      .sort((a, b) => (a.ordre ?? 999) - (b.ordre ?? 999));
    // Conserver l'ordre d'apparition des sous-matières
    const sousMatieresSorted = Array.from(new Set(tousItems.map(c => c.sous_matiere ?? "")));
    let globalOrdre: Chapitre[] = [];
    for (const sm of sousMatieresSorted) {
      if (sm === (sousMatiere ?? "")) {
        globalOrdre = [...globalOrdre, ...nouvelOrdreSubGroup];
      } else {
        globalOrdre = [...globalOrdre, ...tousItems.filter(c => (c.sous_matiere ?? "") === sm)];
      }
    }
    await reordonner(matiere, globalOrdre);
  }

  function toggleAccordeon(matiere: string) {
    setAccordeonsOuverts(prev => {
      const next = new Set(prev);
      if (next.has(matiere)) next.delete(matiere);
      else next.add(matiere);
      return next;
    });
  }

  // Drag handlers — incluent la sous-matière pour cloisonner le glisser par sous-groupe
  function handleDragStart(matiere: string, sousMatiere: string | null, idx: number) {
    setDragSrc({ matiere, sousMatiere, idx });
    setDragOverIdx(idx);
  }

  function handleDragOver(e: React.DragEvent, matiere: string, sousMatiere: string | null, idx: number) {
    e.preventDefault();
    if (dragSrc?.matiere !== matiere || dragSrc.sousMatiere !== sousMatiere) return;
    setDragOverIdx(idx);
  }

  function handleDrop(matiere: string, sousMatiere: string | null, subGroupItems: Chapitre[]) {
    if (!dragSrc || dragSrc.matiere !== matiere || dragSrc.sousMatiere !== sousMatiere || dragOverIdx === null) {
      clearDrag(); return;
    }
    const srcIdx = dragSrc.idx;
    const dstIdx = dragOverIdx;
    if (srcIdx === dstIdx) { clearDrag(); return; }

    const newItems = [...subGroupItems];
    const [removed] = newItems.splice(srcIdx, 1);
    newItems.splice(dstIdx, 0, removed);

    // Si pas de sous-matières dans ce groupe → ordre global ; sinon → ordre par sous-groupe
    const hasSousMatieres = chapitres.some(c => c.matiere === matiere && c.sous_matiere);
    if (hasSousMatieres) {
      reordonnerSousGroupe(matiere, sousMatiere, newItems);
    } else {
      reordonner(matiere, newItems);
    }
    clearDrag();
  }

  function clearDrag() {
    setDragSrc(null);
    setDragOverIdx(null);
  }

  // Grouper par matière, triés par ordre
  const matieresDispo = Array.from(new Set(chapitres.map(c => c.matiere)));
  const groupes = matieresDispo.map(matiere => ({
    matiere,
    items: [...chapitres]
      .filter(c => c.matiere === matiere)
      .sort((a, b) => (a.ordre ?? 999) - (b.ordre ?? 999)),
  }));

  const groupesFiltres = filtreMatiere === "toutes"
    ? groupes
    : groupes.filter(g => g.matiere === filtreMatiere);

  return (
    <EnseignantLayout>
      <div className="page">
        <div className="container" style={{ maxWidth: 820 }}>

          {/* Titre + action */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>📚 Chapitres</h1>
            <button className="btn-primary" onClick={ouvrirCreation}>
              + Nouveau chapitre
            </button>
          </div>

          {/* Filtres par matière */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
            <button
              onClick={() => setFiltreMatiere("toutes")}
              style={{
                padding: "5px 14px", borderRadius: 20, fontSize: 13,
                fontWeight: filtreMatiere === "toutes" ? 700 : 500,
                background: filtreMatiere === "toutes" ? "var(--primary)" : "white",
                color: filtreMatiere === "toutes" ? "white" : "var(--text-secondary)",
                border: filtreMatiere === "toutes" ? "none" : "1px solid var(--border)",
                cursor: "pointer",
              }}
            >
              Toutes
            </button>
            {matieresDispo.map(m => (
              <button
                key={m}
                onClick={() => setFiltreMatiere(m)}
                style={{
                  padding: "5px 14px", borderRadius: 20, fontSize: 13,
                  fontWeight: filtreMatiere === m ? 700 : 500,
                  background: filtreMatiere === m ? (COULEURS_MATIERE[m] ?? "#F3F4F6") : "white",
                  color: "var(--text)",
                  border: filtreMatiere === m
                    ? `2px solid ${COULEURS_MATIERE[m] ?? "#ccc"}`
                    : "1px solid var(--border)",
                  cursor: "pointer",
                  filter: filtreMatiere === m ? "brightness(0.9)" : "none",
                }}
              >
                {ICONES_MATIERE[m] ?? "📚"} {m}
              </button>
            ))}
          </div>

          {chargement ? (
            <div style={{ textAlign: "center", padding: 60, color: "var(--text-secondary)" }}>Chargement…</div>
          ) : groupesFiltres.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-secondary)" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
              <p>Aucun chapitre. Créez-en un pour commencer.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {groupesFiltres.map((groupe) => {
                const ouvert = accordeonsOuverts.has(groupe.matiere);
                const couleur = COULEURS_MATIERE[groupe.matiere] ?? "#F3F4F6";

                // Sous-matières présentes dans ce groupe
                const sousMatieresDispo = Array.from(
                  new Set(groupe.items.filter(c => c.sous_matiere).map(c => c.sous_matiere as string))
                ).sort();
                const filtreSM = filtreSousParMatiere[groupe.matiere] ?? "toutes";

                // Helper : rendu d'un item chapitre (identique en mode plat et groupé)
                const renderItem = (c: Chapitre, i: number, subGroupItems: Chapitre[], smKey: string | null) => {
                  const estSource = dragSrc?.matiere === groupe.matiere && dragSrc.sousMatiere === smKey && dragSrc.idx === i;
                  const estCible = dragSrc?.matiere === groupe.matiere && dragSrc.sousMatiere === smKey && dragOverIdx === i && !estSource;
                  return (
                    <div key={c.id}>
                      <div
                        draggable
                        onDragStart={() => handleDragStart(groupe.matiere, smKey, i)}
                        onDragOver={(e) => handleDragOver(e, groupe.matiere, smKey, i)}
                        onDrop={() => handleDrop(groupe.matiere, smKey, subGroupItems)}
                        onDragEnd={clearDrag}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "11px 18px",
                          background: estSource ? "var(--primary-pale)" : estCible ? `${couleur}80` : "transparent",
                          opacity: estSource ? 0.5 : 1,
                          borderTop: estCible ? `2px solid var(--primary)` : "2px solid transparent",
                          transition: "background 0.1s", cursor: "grab",
                        }}
                      >
                        {/* Poignée drag */}
                        <span style={{ fontSize: 17, color: "#CBD5E1", flexShrink: 0, cursor: "grab", userSelect: "none", lineHeight: 1 }}>
                          ⠿
                        </span>

                        {/* Numéro */}
                        <div style={{
                          width: 26, height: 26, borderRadius: "50%",
                          background: "var(--primary-pale)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 700, color: "var(--primary)", flexShrink: 0,
                        }}>
                          {i + 1}
                        </div>

                        {/* Contenu */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {c.titre}
                          </div>
                          <div style={{ display: "flex", gap: 6, marginTop: 3, alignItems: "center", flexWrap: "wrap" }}>
                            {c.niveaux && (
                              <span className="badge badge-primary" style={{ fontSize: 10 }}>{c.niveaux.nom}</span>
                            )}
                            {/* Badge sous-matière visible seulement en mode plat (pas de sous-matières dans le groupe) */}
                            {c.sous_matiere && sousMatieresDispo.length === 0 && (
                              <span style={{ fontSize: 10, fontWeight: 600, background: "#F3F4F6", color: "#6B7280", padding: "1px 7px", borderRadius: 10 }}>
                                {c.sous_matiere}
                              </span>
                            )}
                            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                              {c.nb_cartes_eval} cartes · Seuil {c.seuil_reussite}%
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          <Link href={`/enseignant/admin/chapitres/${c.id}`} className="btn-secondary" style={{ padding: "4px 10px", fontSize: 13, borderRadius: 6 }}>
                            Exercices
                          </Link>
                          <button className="btn-secondary" onClick={() => ouvrirAffecter(c)} style={{ padding: "4px 10px", fontSize: 13, borderRadius: 6 }}>
                            Affecter
                          </button>
                          <button className="btn-secondary" onClick={() => dupliquerChapitre(c)} disabled={enDuplication.has(c.id)} style={{ padding: "4px 10px", fontSize: 13, borderRadius: 6 }}>
                            {enDuplication.has(c.id) ? "…" : "Dupliquer"}
                          </button>
                          <button className="btn-secondary" onClick={() => ouvrirEdition(c)} style={{ padding: "4px 10px", fontSize: 13, borderRadius: 6 }}>
                            Modifier
                          </button>
                          {aSupprimer === c.id ? (
                            <>
                              <button onClick={() => supprimer(c.id)} style={{ padding: "4px 10px", fontSize: 12, background: "var(--error)", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}>
                                Confirmer
                              </button>
                              <button className="btn-ghost" onClick={() => setASupprimer(null)} style={{ padding: "3px 8px", fontSize: 12 }}>
                                ✕
                              </button>
                            </>
                          ) : (
                            <button className="btn-ghost" onClick={() => setASupprimer(c.id)} style={{ padding: "5px 9px", fontSize: 14, color: "var(--text-secondary)" }}>
                              🗑
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Flèche progression */}
                      {i < subGroupItems.length - 1 && (
                        <div style={{ textAlign: "center", fontSize: 12, color: "var(--border)", padding: "1px 0", lineHeight: 1 }}>
                          ↓
                        </div>
                      )}
                    </div>
                  );
                };

                return (
                  <div key={groupe.matiere} className="card" style={{ padding: 0, overflow: "hidden" }}>

                    {/* En-tête accordéon */}
                    <button
                      onClick={() => toggleAccordeon(groupe.matiere)}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 10,
                        padding: "14px 18px", background: "none", border: "none",
                        borderBottom: ouvert ? "1px solid var(--border)" : "none",
                        cursor: "pointer", textAlign: "left",
                      }}
                    >
                      <span style={{ padding: "4px 14px", borderRadius: 20, fontSize: 13, fontWeight: 700, background: couleur }}>
                        {ICONES_MATIERE[groupe.matiere] ?? "📚"} {groupe.matiere}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        {groupe.items.length} chapitre{groupe.items.length > 1 ? "s" : ""}
                      </span>
                      <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-secondary)" }}>
                        {ouvert ? "▲" : "▼"}
                      </span>
                    </button>

                    {/* Corps accordéon */}
                    {ouvert && (() => {
                      // ── Mode plat : aucune sous-matière dans ce groupe ──────────────
                      if (sousMatieresDispo.length === 0) {
                        return (
                          <div style={{ padding: "6px 0 8px" }}>
                            {groupe.items.length > 1 && (
                              <div style={{ padding: "2px 18px 8px", fontSize: 11, color: "var(--text-secondary)" }}>
                                ⠿ Glissez les chapitres pour définir la progression (succès à l'éval → chapitre suivant)
                              </div>
                            )}
                            {groupe.items.map((c, i) => renderItem(c, i, groupe.items, null))}
                          </div>
                        );
                      }

                      // ── Mode groupé : sous-matières présentes ───────────────────────
                      const sansGroupe = groupe.items.filter(c => !c.sous_matiere);
                      const sousGroupes = [
                        ...sousMatieresDispo
                          .filter(sm => filtreSM === "toutes" || sm === filtreSM)
                          .map(sm => ({ sm, items: groupe.items.filter(c => c.sous_matiere === sm) })),
                        ...(filtreSM === "toutes" && sansGroupe.length > 0
                          ? [{ sm: null, items: sansGroupe }]
                          : []),
                      ];

                      return (
                        <div style={{ padding: "6px 0 8px" }}>
                          {/* Pills sous-matière — à l'intérieur de l'accordéon */}
                          <div style={{ display: "flex", gap: 6, padding: "8px 18px 12px", flexWrap: "wrap", alignItems: "center" }}>
                            <button
                              onClick={() => setFiltreSousParMatiere(prev => ({ ...prev, [groupe.matiere]: "toutes" }))}
                              style={{
                                padding: "3px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                                fontWeight: filtreSM === "toutes" ? 700 : 500,
                                background: filtreSM === "toutes" ? "#374151" : "white",
                                color: filtreSM === "toutes" ? "white" : "var(--text-secondary)",
                                border: filtreSM === "toutes" ? "none" : "1px solid var(--border)",
                              }}
                            >Tout</button>
                            {sousMatieresDispo.map(sm => (
                              <button
                                key={sm}
                                onClick={() => setFiltreSousParMatiere(prev => ({ ...prev, [groupe.matiere]: sm }))}
                                style={{
                                  padding: "3px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                                  fontWeight: filtreSM === sm ? 700 : 500,
                                  background: filtreSM === sm ? "#F3F4F6" : "white",
                                  color: filtreSM === sm ? "#374151" : "var(--text-secondary)",
                                  border: filtreSM === sm ? "2px solid #9CA3AF" : "1px solid var(--border)",
                                }}
                              >{sm}</button>
                            ))}
                          </div>

                          {/* Sous-groupes */}
                          {sousGroupes.map(({ sm, items }) => (
                            <div key={sm ?? "__sans__"}>
                              {/* En-tête du sous-groupe */}
                              <div style={{
                                padding: "6px 18px 4px", display: "flex", alignItems: "center", gap: 8,
                                borderTop: "1px solid var(--border)",
                              }}>
                                <span style={{
                                  fontSize: 11, fontWeight: 700, color: "#6B7280",
                                  background: "#F3F4F6", padding: "2px 10px", borderRadius: 10,
                                }}>
                                  {sm ?? "Général"}
                                </span>
                                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                                  {items.length} chapitre{items.length > 1 ? "s" : ""}
                                </span>
                              </div>
                              {items.length > 1 && (
                                <div style={{ padding: "2px 18px 4px", fontSize: 11, color: "var(--text-secondary)" }}>
                                  ⠿ Glissez pour définir la progression au sein de cette sous-matière
                                </div>
                              )}
                              {items.map((c, i) => renderItem(c, i, items, sm))}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal erreur suppression */}
      {confirmSuppression && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 24,
        }}>
          <div className="card" style={{ maxWidth: 400, padding: "28px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <p style={{ fontWeight: 700, marginBottom: 8 }}>Impossible de supprimer</p>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 20 }}>{confirmSuppression.erreur}</p>
            <button className="btn-primary" onClick={() => setConfirmSuppression(null)}>Fermer</button>
          </div>
        </div>
      )}

      {/* Modal Affecter un chapitre */}
      {chapitreAAffecter && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24,
        }}>
          <div className="card" style={{ width: "100%", maxWidth: 540, padding: "28px 24px", maxHeight: "92vh", overflowY: "auto" }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>
              📋 Affecter — {chapitreAAffecter.titre}
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
              {exercicesAffecter.length === 0
                ? "⚠️ Ce chapitre n'a pas encore d'exercices dans la banque."
                : `${exercicesAffecter.length} exercice${exercicesAffecter.length > 1 ? "s" : ""} à affecter.`}
            </p>

            {erreurAffecter && (
              <div style={{ background: "#FEE2E2", color: "#DC2626", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                {erreurAffecter}
              </div>
            )}

            {/* Liste exercices (lecture seule) */}
            {exercicesAffecter.length > 0 && (
              <div style={{ marginBottom: 20, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "8px 12px", background: "var(--bg)", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Exercices (dans l'ordre)
                </div>
                {exercicesAffecter.map((ex, i) => (
                  <div key={ex.id} style={{ padding: "8px 14px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", width: 18, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: 13, color: "var(--text)", flex: 1 }}>{ex.titre ?? `Exercice ${i + 1}`}</span>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      {ex.type === "exercice" ? "📝" : ex.type === "calcul_mental" ? "🔢" : "📋"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Assignation */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Attribuer à</label>
              <AssignationSelector value={assignationAffecter} onChange={setAssignationAffecter} />
            </div>

            {/* Date de début */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Date de début</label>
              <input
                type="date"
                className="form-input"
                value={dateDebutAffecter}
                onChange={(e) => setDateDebutAffecter(e.target.value)}
              />
            </div>

            {/* Toggle étalement */}
            {exercicesAffecter.length > 1 && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Distribution</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setEtalerJours(true)}
                    style={{
                      flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                      fontWeight: etalerJours ? 700 : 500,
                      background: etalerJours ? "var(--primary-pale)" : "var(--white)",
                      color: etalerJours ? "var(--primary)" : "var(--text-secondary)",
                      border: etalerJours ? "2px solid var(--primary)" : "1px solid var(--border)",
                    }}
                  >
                    📅 Étaler sur {exercicesAffecter.length} jours
                  </button>
                  <button
                    type="button"
                    onClick={() => setEtalerJours(false)}
                    style={{
                      flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                      fontWeight: !etalerJours ? 700 : 500,
                      background: !etalerJours ? "var(--primary-pale)" : "var(--white)",
                      color: !etalerJours ? "var(--primary)" : "var(--text-secondary)",
                      border: !etalerJours ? "2px solid var(--primary)" : "1px solid var(--border)",
                    }}
                  >
                    📦 Tout le même jour
                  </button>
                </div>
                {etalerJours && exercicesAffecter.length > 0 && (
                  <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
                    1 exercice par jour du {new Date(dateDebutAffecter).toLocaleDateString("fr-FR")} au{" "}
                    {new Date(new Date(dateDebutAffecter).getTime() + (exercicesAffecter.length - 1) * 86_400_000).toLocaleDateString("fr-FR")}
                  </p>
                )}
              </div>
            )}

            {/* Boutons */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="btn-primary"
                onClick={validerAffectation}
                disabled={enAffectation || exercicesAffecter.length === 0}
                style={{ flex: 1 }}
              >
                {enAffectation ? `Affectation… (${exercicesAffecter.length} exercices)` : "✓ Affecter le chapitre"}
              </button>
              <button className="btn-ghost" onClick={() => setChapitreAAffecter(null)} style={{ flex: 1 }}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Formulaire création / édition */}
      {formVisible && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24,
        }}>
          <div className="card" style={{ width: "100%", maxWidth: 500, padding: "28px 24px", maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 20 }}>
              {chapitreEnEdition ? "✏️ Modifier le chapitre" : "➕ Nouveau chapitre"}
            </h2>

            {erreur && (
              <div style={{ background: "#FEE2E2", color: "#DC2626", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                {erreur}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Titre *</label>
                <input
                  type="text" className="form-input" autoFocus
                  value={form.titre} onChange={(e) => setForm((f) => ({ ...f, titre: e.target.value }))}
                  placeholder="Ex. La multiplication posée"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Matière *</label>
                  <input
                    list="matieres-list"
                    className="form-input"
                    value={form.matiere}
                    onChange={(e) => setForm((f) => ({ ...f, matiere: e.target.value }))}
                    placeholder="Ex. maths, histoire-géo, EMC…"
                  />
                  <datalist id="matieres-list">
                    {Array.from(new Set([...MATIERES_SUGGESTIONS, ...Array.from(new Set(chapitres.map(c => c.matiere)))])).map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Niveau *</label>
                  <select className="form-input" value={form.niveau_id} onChange={(e) => setForm((f) => ({ ...f, niveau_id: e.target.value }))}>
                    <option value="">— Choisir —</option>
                    {niveaux.map((n) => <option key={n.id} value={n.id}>{n.nom}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
                  Sous-matière <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>(optionnel)</span>
                </label>
                <input
                  list="sous-matieres-list"
                  type="text"
                  className="form-input"
                  value={form.sous_matiere}
                  onChange={(e) => setForm((f) => ({ ...f, sous_matiere: e.target.value }))}
                  placeholder="Ex. Calcul, Numération, Géométrie…"
                />
                <datalist id="sous-matieres-list">
                  {Array.from(new Set(chapitres.map(c => c.sous_matiere).filter(Boolean))).map((s) => (
                    <option key={s as string} value={s as string} />
                  ))}
                </datalist>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Description</label>
                <textarea
                  className="form-input" rows={3}
                  value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Résumé du contenu — utilisé par l'IA pour générer les cartes d'éval"
                  style={{ resize: "vertical" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
                    Cartes d'éval : <strong>{form.nb_cartes_eval}</strong>
                  </label>
                  <input type="range" min={10} max={30} step={5}
                    value={form.nb_cartes_eval} onChange={(e) => setForm((f) => ({ ...f, nb_cartes_eval: +e.target.value }))}
                    style={{ width: "100%" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-secondary)" }}>
                    <span>10</span><span>30</span>
                  </div>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
                    Seuil réussite : <strong>{form.seuil_reussite}%</strong>
                  </label>
                  <input type="range" min={70} max={100} step={5}
                    value={form.seuil_reussite} onChange={(e) => setForm((f) => ({ ...f, seuil_reussite: +e.target.value }))}
                    style={{ width: "100%" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-secondary)" }}>
                    <span>70%</span><span>100%</span>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button className="btn-primary" onClick={sauvegarder} disabled={enSauvegarde} style={{ flex: 1 }}>
                  {enSauvegarde ? "Sauvegarde…" : (chapitreEnEdition ? "✓ Enregistrer" : "✓ Créer")}
                </button>
                <button className="btn-ghost" onClick={() => setFormVisible(false)} style={{ flex: 1 }}>
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </EnseignantLayout>
  );
}
