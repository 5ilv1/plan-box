"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";


/* ── Types ─────────────────────────────────────────── */

interface Exercice {
  id: string;
  chapitre_id: string;
  titre: string;
  type: string;
  ordre: number;
  nb_questions: number | null;
  contenu: Record<string, unknown> | null;
}

interface Regle {
  id: string;
  titre: string;
  description: string | null;
  date_debut: string | null;
  created_at: string;
  exercices: Exercice[];
  nb_groupes_assignes: number;
  niveaux?: { nom: string } | null;
}

interface Groupe {
  id: string;
  nom: string;
}

/* ── Les 9 règles P5 pré-définies ────────────────── */

const REGLES_P5: {
  titre: string;
  regle: string;
  astuce: string;
  exemple: string;
  categorie: "homophone" | "morphologie" | "syntaxe";
  mots_cibles?: string[];
}[] = [
  {
    titre: "est / et",
    regle: "« est » est le verbe être conjugué (on peut le remplacer par « était »). « et » est une conjonction de coordination (on peut le remplacer par « et puis »).",
    astuce: "Remplace par « était » → si ça fonctionne, écris « est ». Sinon, écris « et ».",
    exemple: "Le chat est fatigué et il dort. → Le chat était fatigué et puis il dort.",
    categorie: "homophone",
    mots_cibles: ["est", "et"],
  },
  {
    titre: "Infinitif / participe passé (-er / -é)",
    regle: "Après un auxiliaire (être/avoir conjugué), on utilise le participe passé (-é). Après une préposition (à, de, pour, sans) ou un autre verbe conjugué, on utilise l'infinitif (-er).",
    astuce: "Remplace par « vendre/vendu » : si « vendu » fonctionne → -é (participe passé). Si « vendre » fonctionne → -er (infinitif).",
    exemple: "Il a mangé une pomme. / Il va manger une pomme.",
    categorie: "homophone",
  },
  {
    titre: "ou / où",
    regle: "« ou » exprime un choix entre deux possibilités (on peut le remplacer par « ou bien »). « où » indique un lieu ou un moment.",
    astuce: "Remplace par « ou bien » : si ça fonctionne → « ou ». Sinon → « où ».",
    exemple: "Tu veux du thé ou du café ? / Où habites-tu ?",
    categorie: "homophone",
    mots_cibles: ["ou", "où"],
  },
  {
    titre: "Pluriel des noms en -ou",
    regle: "En général, les noms en -ou prennent un -s au pluriel. Exceptions : bijoux, cailloux, choux, genoux, hiboux, joujoux, poux → prennent un -x.",
    astuce: "Retiens les 7 exceptions en -oux : Viens mon chou, mon bijou, sur mes genoux, avec tes joujoux, et ne jette pas de cailloux sur ce hibou plein de poux !",
    exemple: "des clous, des trous, MAIS des bijoux, des cailloux.",
    categorie: "morphologie",
  },
  {
    titre: "La négation ne…pas",
    regle: "La négation encadre le verbe avec « ne…pas » (ou « ne…plus », « ne…jamais », « ne…rien »). Le « ne » se place avant le verbe et le deuxième mot après.",
    astuce: "Cherche le verbe conjugué → place « ne » devant et « pas » (ou autre) après.",
    exemple: "Il ne mange pas de pomme. / Elle n'aime plus le chocolat.",
    categorie: "syntaxe",
  },
  {
    titre: "sont / son",
    regle: "« sont » est le verbe être conjugué à la 3e personne du pluriel (on peut le remplacer par « étaient »). « son » est un déterminant possessif (on peut le remplacer par « mon » ou « leur »).",
    astuce: "Remplace par « étaient » → si ça fonctionne, écris « sont ». Sinon, essaie « mon/leur » → écris « son ».",
    exemple: "Ils sont contents. / Il a pris son cartable.",
    categorie: "homophone",
    mots_cibles: ["sont", "son"],
  },
  {
    titre: "Pluriels en -al / -aux",
    regle: "Les noms et adjectifs en -al font leur pluriel en -aux. Exceptions courantes : bals, carnavals, chacals, festivals, récitals, régals.",
    astuce: "Par défaut → -aux. Les exceptions sont des fêtes et des animaux : bals, festivals, carnavals, chacals, récitals, régals.",
    exemple: "un cheval → des chevaux / un journal → des journaux / MAIS un festival → des festivals.",
    categorie: "morphologie",
  },
  {
    titre: "Pluriels en -ail / -aux",
    regle: "La plupart des noms en -ail prennent un -s au pluriel. Exceptions : bail → baux, corail → coraux, émail → émaux, soupirail → soupiraux, travail → travaux, vitrail → vitraux.",
    astuce: "Par défaut → -ails. Les exceptions changent en -aux : baux, coraux, émaux, soupiraux, travaux, vitraux.",
    exemple: "des détails, des rails, MAIS des travaux, des vitraux.",
    categorie: "morphologie",
  },
  {
    titre: "Pluriel des adjectifs",
    regle: "Les adjectifs s'accordent en genre et en nombre avec le nom qu'ils qualifient. Au pluriel, on ajoute généralement -s. Adjectifs en -eau → -eaux. Adjectifs en -al → -aux (sauf banal, fatal, final, naval → -als).",
    astuce: "Regarde le nom : s'il est au pluriel, l'adjectif aussi ! Attention aux adjectifs en -eau et -al.",
    exemple: "de beaux chevaux / des jeux brutaux / MAIS des combats navals.",
    categorie: "morphologie",
  },
];

/* ── Styles utilitaires ──────────────────────────── */

const btnStyle = (color: string): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "6px 12px",
  borderRadius: 8,
  border: `1px solid ${color}`,
  background: "white",
  color,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
  transition: "all 0.15s",
});

const cardStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 12,
  border: "1px solid var(--pb-outline-variant, #E0E0E0)",
  overflow: "hidden",
  transition: "box-shadow 0.2s",
};

/* ── Composant Modal ─────────────────────────────── */

function Modal({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #E0E0E0" }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>{title}</h3>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "#666" }}>✕</button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

/* ── Composant Field ─────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#374151" }}>{label}</label>
      {children}
    </div>
  );
}

/* ── Page principale ─────────────────────────────── */

export default function MaPtiteRegle() {
  const supabase = createClient();
  const [regles, setRegles] = useState<Regle[]>([]);
  const [groupes, setGroupes] = useState<Groupe[]>([]);
  const [niveaux, setNiveaux] = useState<{ id: string; nom: string }[]>([]);
  const [chargement, setChargement] = useState(true);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [enseignantId, setEnseignantId] = useState<string | null>(null);

  // Création
  const [showCreation, setShowCreation] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [newTitre, setNewTitre] = useState("");
  const [newRegle, setNewRegle] = useState("");
  const [newAstuce, setNewAstuce] = useState("");
  const [newExemple, setNewExemple] = useState("");
  const [newNiveauId, setNewNiveauId] = useState("");
  const [newDateDebut, setNewDateDebut] = useState("");
  const [newCategorie, setNewCategorie] = useState<"homophone" | "morphologie" | "syntaxe">("homophone");
  const [newMotsCibles, setNewMotsCibles] = useState<string[]>([]);
  const [selectedGroupes, setSelectedGroupes] = useState<Set<string>>(new Set());
  const [enCreation, setEnCreation] = useState(false);
  const [creationStatus, setCreationStatus] = useState<string | null>(null);

  // Suppression
  const [suppression, setSuppression] = useState<string | null>(null);

  // Assignation
  const [assignRegle, setAssignRegle] = useState<string | null>(null);
  const [assignGroupes, setAssignGroupes] = useState<Set<string>>(new Set());

  // Aperçu
  const [apercuRegle, setApercuRegle] = useState<Regle | null>(null);

  // Édition
  const [editRegle, setEditRegle] = useState<Regle | null>(null);
  const [editDateDebut, setEditDateDebut] = useState("");
  const [enSauvegarde, setEnSauvegarde] = useState(false);

  /* ── Chargement ─────────────────────────────────── */

  const charger = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setEnseignantId(user.id);

    const [reglesRes, groupesRes, niveauxRes] = await Promise.all([
      fetch(`/api/ma-ptite-regle?enseignant_id=${user.id}`).then((r) => r.json()),
      supabase.from("groupes").select("id, nom").order("nom"),
      supabase.from("niveaux").select("id, nom").order("nom"),
    ]);

    setRegles(reglesRes.regles ?? []);
    setGroupes(groupesRes.data ?? []);
    setNiveaux(niveauxRes.data ?? []);
    setChargement(false);
  }, [supabase]);

  useEffect(() => { charger(); }, [charger]);

  /* ── Créer une règle ────────────────────────────── */

  async function creerRegle() {
    if (!newTitre.trim() || !newRegle.trim()) return;
    setEnCreation(true);
    setCreationStatus("Création du chapitre…");

    try {
      setCreationStatus("Génération des 5 exercices par IA… (30-60s)");
      const res = await fetch("/api/ma-ptite-regle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titre: newTitre,
          regle: newRegle,
          astuce: newAstuce,
          exemple: newExemple,
          categorie: newCategorie,
          mots_cibles: newMotsCibles.length > 0 ? newMotsCibles : undefined,
          niveau_id: newNiveauId || null,
          date_debut: newDateDebut || null,
          groupe_ids: [...selectedGroupes],
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert("Erreur : " + (err.error || "Erreur inconnue"));
        return;
      }

      setCreationStatus("Règle créée avec succès !");
      setShowCreation(false);
      setNewTitre(""); setNewRegle(""); setNewAstuce(""); setNewExemple("");
      setNewNiveauId(""); setNewDateDebut(""); setNewCategorie("homophone"); setNewMotsCibles([]);
      setSelectedGroupes(new Set());
      await charger();
    } catch {
      alert("Erreur réseau");
    } finally {
      setEnCreation(false);
      setTimeout(() => setCreationStatus(null), 3000);
    }
  }

  /* ── Supprimer ──────────────────────────────────── */

  async function supprimerRegle(id: string) {
    await fetch(`/api/ma-ptite-regle?id=${id}`, { method: "DELETE" });
    setSuppression(null);
    await charger();
  }

  /* ── Assigner ───────────────────────────────────── */

  async function assignerGroupes(chapitreId: string) {
    for (const gid of assignGroupes) {
      await fetch("/api/chapitres/assignation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapitre_id: chapitreId, groupe_id: gid, actif: true }),
      });
    }
    setAssignRegle(null);
    setAssignGroupes(new Set());
    await charger();
  }

  /* ── Utiliser un modèle P5 ──────────────────────── */

  function utiliserModele(m: typeof REGLES_P5[0]) {
    setNewTitre(m.titre);
    setNewRegle(m.regle);
    setNewAstuce(m.astuce);
    setNewExemple(m.exemple);
    setNewCategorie(m.categorie);
    setNewMotsCibles(m.mots_cibles ?? []);
    setShowTemplates(false);
    setShowCreation(true);
  }

  /* ── Modifier (date) ─────────────────────────────── */

  function ouvrirEdition(r: Regle) {
    setEditRegle(r);
    setEditDateDebut(r.date_debut ?? "");
  }

  async function sauvegarderEdition() {
    if (!editRegle) return;
    setEnSauvegarde(true);
    try {
      const admin = await fetch(`/api/ma-ptite-regle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editRegle.id, date_debut: editDateDebut || null }),
      });
      if (admin.ok) {
        setEditRegle(null);
        await charger();
      }
    } finally {
      setEnSauvegarde(false);
    }
  }

  /* ── Rendu ──────────────────────────────────────── */

  if (chargement) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
        <div style={{ textAlign: "center", color: "#666" }}>
          <span className="ms" style={{ fontSize: 40, display: "block", marginBottom: 12 }}>hourglass_empty</span>
          Chargement…
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <span className="ms" style={{ fontSize: 28 }}>ink_pen</span>
            Ma P&apos;tite Règle
          </h2>
          <p style={{ margin: "4px 0 0", color: "#666", fontSize: 14 }}>
            {regles.length} règle{regles.length > 1 ? "s" : ""} · Rituels orthographe hebdomadaires
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowTemplates(true)}
            style={{ ...btnStyle("#7C3AED"), background: "#F5F3FF" }}
          >
            <span className="ms" style={{ fontSize: 16 }}>auto_awesome</span>
            Règles P5
          </button>
          <button
            onClick={() => setShowCreation(true)}
            style={{ ...btnStyle("white"), background: "var(--pb-primary, #0050D4)", color: "white", border: "none" }}
          >
            <span className="ms" style={{ fontSize: 16 }}>add</span>
            Nouvelle règle
          </button>
        </div>
      </div>

      {/* Liste des règles */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {regles.length === 0 && (
          <div style={{ ...cardStyle, padding: 40, textAlign: "center", color: "#999" }}>
            <span className="ms" style={{ fontSize: 48, display: "block", marginBottom: 12 }}>edit_note</span>
            <p style={{ margin: 0, fontSize: 15 }}>Aucune règle créée. Commencez par ajouter une règle ou utilisez les modèles Période 5.</p>
          </div>
        )}

        {regles.map((r) => {
          const isOpen = ouvert === r.id;
          const isDeleting = suppression === r.id;
          const isAssigning = assignRegle === r.id;
          const nbExos = r.exercices.filter((e) => e.type !== "revision").length;
          const hasLecon = r.exercices.some((e) => e.type === "revision");

          return (
            <div key={r.id} style={cardStyle}>
              {/* En-tête */}
              <div
                onClick={() => setOuvert(isOpen ? null : r.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                  cursor: "pointer", userSelect: "none",
                }}
              >
                <span className="ms" style={{ fontSize: 24, color: "#7C3AED" }}>ink_pen</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{r.titre}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12, color: "#888", marginTop: 2 }}>
                    <span>{new Date(r.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</span>
                    {hasLecon && <span style={{ color: "#7C3AED" }}>Leçon incluse</span>}
                    <span>{nbExos} exercice{nbExos > 1 ? "s" : ""}</span>
                    {r.date_debut && (
                      <span style={{ color: new Date(r.date_debut + "T00:00:00") > new Date() ? "#D97706" : "#059669" }}>
                        <span className="ms" style={{ fontSize: 12, verticalAlign: -1 }}>calendar_today</span>{" "}
                        {new Date(r.date_debut + "T00:00:00") > new Date() ? "Programmée le " : "Depuis le "}
                        {new Date(r.date_debut + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                      </span>
                    )}
                    {r.nb_groupes_assignes > 0 && (
                      <span style={{ color: "#059669" }}>{r.nb_groupes_assignes} groupe{r.nb_groupes_assignes > 1 ? "s" : ""}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => setApercuRegle(r)} title="Aperçu" style={btnStyle("#6B7280")}>
                    <span className="ms" style={{ fontSize: 16 }}>visibility</span>
                  </button>
                  <button onClick={() => ouvrirEdition(r)} title="Modifier" style={btnStyle("#6B7280")}>
                    <span className="ms" style={{ fontSize: 16 }}>edit</span>
                  </button>
                  <button onClick={() => { setAssignRegle(r.id); setAssignGroupes(new Set()); }} title="Assigner" style={btnStyle("var(--pb-primary, #0050D4)")}>
                    <span className="ms" style={{ fontSize: 16 }}>group_add</span>
                  </button>
                  {isDeleting ? (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => supprimerRegle(r.id)} style={{ ...btnStyle("#DC2626"), background: "#DC2626", color: "white", border: "none", fontSize: 12, padding: "4px 10px" }}>Confirmer</button>
                      <button onClick={() => setSuppression(null)} style={{ ...btnStyle("#6B7280"), fontSize: 12, padding: "4px 8px" }}>✕</button>
                    </div>
                  ) : (
                    <button onClick={() => setSuppression(r.id)} title="Supprimer" style={btnStyle("#DC2626")}>
                      <span className="ms" style={{ fontSize: 16 }}>delete</span>
                    </button>
                  )}
                </div>

                <span className="ms" style={{
                  fontSize: 20, color: "var(--pb-on-surface-variant)",
                  transition: "transform 0.2s",
                  transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                  flexShrink: 0,
                }}>
                  expand_more
                </span>
              </div>

              {/* Panneau assignation */}
              {isAssigning && (
                <div style={{ padding: "12px 16px", borderTop: "1px solid #E0E0E0", background: "#F8FAFC" }} onClick={(e) => e.stopPropagation()}>
                  <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Assigner à des groupes :</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                    {groupes.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => {
                          const next = new Set(assignGroupes);
                          if (next.has(g.id)) next.delete(g.id); else next.add(g.id);
                          setAssignGroupes(next);
                        }}
                        style={{
                          padding: "4px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer",
                          border: assignGroupes.has(g.id) ? "2px solid var(--pb-primary, #0050D4)" : "1px solid #D1D5DB",
                          background: assignGroupes.has(g.id) ? "#EFF6FF" : "white",
                          fontWeight: assignGroupes.has(g.id) ? 600 : 400,
                        }}
                      >
                        {g.nom}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => assignerGroupes(r.id)}
                      disabled={assignGroupes.size === 0}
                      style={{
                        ...btnStyle("white"),
                        background: assignGroupes.size > 0 ? "var(--pb-primary, #0050D4)" : "#D1D5DB",
                        color: "white", border: "none", fontSize: 13,
                      }}
                    >
                      Assigner
                    </button>
                    <button onClick={() => setAssignRegle(null)} style={btnStyle("#6B7280")}>Annuler</button>
                  </div>
                </div>
              )}

              {/* Détail (exercices) */}
              {isOpen && (
                <div style={{ padding: "12px 16px", borderTop: "1px solid #E0E0E0", background: "#FAFAFA" }}>
                  {r.description && (
                    <div style={{ marginBottom: 12, padding: 12, background: "#F5F3FF", borderRadius: 8, fontSize: 13 }}>
                      <strong style={{ color: "#7C3AED" }}>Règle :</strong> {r.description}
                    </div>
                  )}
                  <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#374151" }}>
                    Exercices ({r.exercices.length}) :
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {r.exercices.map((ex) => (
                      <div key={ex.id} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "8px 12px", background: "white", borderRadius: 8,
                        border: "1px solid #E5E7EB", fontSize: 13,
                      }}>
                        <span className="ms" style={{ fontSize: 18, color: ex.type === "revision" ? "#7C3AED" : "#059669" }}>
                          {ex.type === "revision" ? "menu_book" : ex.type === "qcm" ? "quiz" : ex.type === "texte_a_trous" ? "edit_note" : "transform"}
                        </span>
                        <span style={{ flex: 1 }}>{ex.titre}</span>
                        <span style={{
                          padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 500,
                          background: ex.type === "revision" ? "#F5F3FF" : "#ECFDF5",
                          color: ex.type === "revision" ? "#7C3AED" : "#059669",
                        }}>
                          {ex.type === "revision" ? "Leçon" : ex.type}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Modale création ──────────────────────────── */}
      {showCreation && (
        <Modal onClose={() => { if (!enCreation) setShowCreation(false); }} title="Nouvelle règle d'orthographe">
          <Field label="Titre de la règle *">
            <input
              className="form-input"
              value={newTitre}
              onChange={(e) => setNewTitre(e.target.value)}
              placeholder="Ex : est / et"
              style={{ width: "100%", fontSize: 14 }}
            />
          </Field>
          <Field label="La règle (trace écrite) *">
            <textarea
              className="form-input"
              value={newRegle}
              onChange={(e) => setNewRegle(e.target.value)}
              placeholder="Formule la règle simplement…"
              rows={3}
              style={{ width: "100%", fontSize: 14, resize: "vertical" }}
            />
          </Field>
          <Field label="Astuce de substitution">
            <textarea
              className="form-input"
              value={newAstuce}
              onChange={(e) => setNewAstuce(e.target.value)}
              placeholder="Ex : Remplace par « était » → si ça fonctionne, écris « est »"
              rows={2}
              style={{ width: "100%", fontSize: 14, resize: "vertical" }}
            />
          </Field>
          <Field label="Exemple">
            <input
              className="form-input"
              value={newExemple}
              onChange={(e) => setNewExemple(e.target.value)}
              placeholder="Ex : Le chat est fatigué et il dort."
              style={{ width: "100%", fontSize: 14 }}
            />
          </Field>
          <Field label="Niveau">
            <select
              className="form-input"
              value={newNiveauId}
              onChange={(e) => setNewNiveauId(e.target.value)}
              style={{ width: "100%", fontSize: 14 }}
            >
              <option value="">Tous niveaux</option>
              {niveaux.map((n) => (
                <option key={n.id} value={n.id}>{n.nom}</option>
              ))}
            </select>
          </Field>
          <Field label="Date de début (programmation)">
            <input
              type="date"
              className="form-input"
              value={newDateDebut}
              onChange={(e) => setNewDateDebut(e.target.value)}
              style={{ width: "100%", fontSize: 14 }}
            />
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#888" }}>
              Laissez vide pour rendre disponible immédiatement.
            </p>
          </Field>

          {groupes.length > 0 && (
            <Field label="Assigner aux groupes (optionnel)">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {groupes.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      const next = new Set(selectedGroupes);
                      if (next.has(g.id)) next.delete(g.id); else next.add(g.id);
                      setSelectedGroupes(next);
                    }}
                    style={{
                      padding: "4px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer",
                      border: selectedGroupes.has(g.id) ? "2px solid var(--pb-primary, #0050D4)" : "1px solid #D1D5DB",
                      background: selectedGroupes.has(g.id) ? "#EFF6FF" : "white",
                      fontWeight: selectedGroupes.has(g.id) ? 600 : 400,
                    }}
                  >
                    {g.nom}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {creationStatus && (
            <div style={{
              padding: "10px 14px", borderRadius: 8, marginBottom: 12,
              background: enCreation ? "#FEF3C7" : "#ECFDF5",
              color: enCreation ? "#92400E" : "#065F46",
              fontSize: 13, display: "flex", alignItems: "center", gap: 8,
            }}>
              {enCreation && <span className="ms" style={{ fontSize: 16, animation: "spin 1s linear infinite" }}>progress_activity</span>}
              {creationStatus}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setShowCreation(false)} disabled={enCreation} style={btnStyle("#6B7280")}>Annuler</button>
            <button
              onClick={creerRegle}
              disabled={enCreation || !newTitre.trim() || !newRegle.trim()}
              style={{
                ...btnStyle("white"),
                background: enCreation || !newTitre.trim() || !newRegle.trim() ? "#D1D5DB" : "var(--pb-primary, #0050D4)",
                color: "white", border: "none",
              }}
            >
              {enCreation ? "Génération en cours…" : "Créer et générer les exercices"}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modale édition ─────────────────────────────── */}
      {editRegle && (
        <Modal onClose={() => setEditRegle(null)} title="Modifier la règle">
          <Field label="Titre">
            <input className="form-input" value={editRegle.titre} disabled style={{ width: "100%", fontSize: 14, opacity: 0.6 }} />
          </Field>
          <Field label="Date de début">
            <input
              type="date"
              className="form-input"
              value={editDateDebut}
              onChange={(e) => setEditDateDebut(e.target.value)}
              style={{ width: "100%", fontSize: 14 }}
            />
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#888" }}>
              Laissez vide pour rendre disponible immédiatement.
            </p>
          </Field>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={() => setEditRegle(null)} style={btnStyle("#6B7280")}>Annuler</button>
            <button
              onClick={sauvegarderEdition}
              disabled={enSauvegarde}
              style={{ ...btnStyle("white"), background: "var(--pb-primary, #0050D4)", color: "white", border: "none" }}
            >
              {enSauvegarde ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modale aperçu ─────────────────────────────── */}
      {apercuRegle && (
        <Modal onClose={() => setApercuRegle(null)} title={apercuRegle.titre}>
          {/* Leçon */}
          {apercuRegle.description && (
            <div style={{ marginBottom: 16, padding: 14, background: "#F5F3FF", borderRadius: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#7C3AED", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <span className="ms" style={{ fontSize: 18 }}>menu_book</span> Leçon
              </div>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{apercuRegle.description}</p>
            </div>
          )}

          {/* Exercices */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {apercuRegle.exercices
              .filter((ex) => ex.type !== "revision")
              .map((ex, i) => {
                const contenu = ex.contenu as Record<string, unknown> | null;
                const questions = (contenu?.questions as Array<Record<string, unknown>>) ?? [];
                const trous = (contenu?.trous as Array<Record<string, unknown>>) ?? [];
                const consigne = (contenu?.consigne as string) ?? "";

                return (
                  <div key={ex.id} style={{ border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
                      background: "#F9FAFB", borderBottom: "1px solid #E5E7EB",
                    }}>
                      <span style={{
                        width: 24, height: 24, borderRadius: "50%", background: "#7C3AED", color: "white",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0,
                      }}>{i + 1}</span>
                      <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{ex.titre}</span>
                      <span style={{
                        padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 500,
                        background: "#ECFDF5", color: "#059669",
                      }}>
                        {ex.type === "qcm" ? "QCM" : ex.type === "texte_a_trous" ? "Texte à trous" : "Rédaction"}
                      </span>
                    </div>
                    <div style={{ padding: "10px 14px", fontSize: 13 }}>
                      {consigne && <p style={{ margin: "0 0 8px", fontStyle: "italic", color: "#666" }}>{consigne}</p>}

                      {/* QCM : afficher les questions */}
                      {ex.type === "qcm" && questions.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {questions.slice(0, 3).map((q, qi) => (
                            <div key={qi} style={{ padding: "6px 10px", background: "#F9FAFB", borderRadius: 6, fontSize: 12 }}>
                              <strong>Q{qi + 1}.</strong> {String(q.question ?? q.enonce ?? "")}
                              {Array.isArray(q.options) && (
                                <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                                  {(q.options as string[]).map((opt, oi) => (
                                    <span key={oi} style={{
                                      padding: "2px 6px", borderRadius: 4, fontSize: 11,
                                      background: oi === (q.reponse_correcte as number) ? "#DCFCE7" : "#F3F4F6",
                                      fontWeight: oi === (q.reponse_correcte as number) ? 600 : 400,
                                    }}>
                                      {opt}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                          {questions.length > 3 && (
                            <p style={{ margin: 0, fontSize: 11, color: "#999" }}>+ {questions.length - 3} autres questions</p>
                          )}
                        </div>
                      ) : null}

                      {/* Texte à trous : afficher un extrait */}
                      {ex.type === "texte_a_trous" && contenu?.texte_complet ? (
                        <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.6 }}>
                          <p style={{ margin: "0 0 4px" }}>
                            {String(contenu.texte_complet).slice(0, 200)}…
                          </p>
                          <p style={{ margin: 0, color: "#999", fontSize: 11 }}>{trous.length} trous à compléter</p>
                        </div>
                      ) : null}

                      {/* Exercice libre : afficher les questions */}
                      {ex.type === "exercice" && questions.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {questions.slice(0, 3).map((q, qi) => (
                            <div key={qi} style={{ padding: "6px 10px", background: "#F9FAFB", borderRadius: 6, fontSize: 12 }}>
                              <strong>Q{qi + 1}.</strong> {String(q.enonce ?? "")}
                              <span style={{ color: "#059669", marginLeft: 8 }}>→ {String(q.reponse_attendue ?? "")}</span>
                            </div>
                          ))}
                          {questions.length > 3 && (
                            <p style={{ margin: 0, fontSize: 11, color: "#999" }}>+ {questions.length - 3} autres questions</p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
          </div>
        </Modal>
      )}

      {/* ── Modale modèles P5 ────────────────────────── */}
      {showTemplates && (
        <Modal onClose={() => setShowTemplates(false)} title="Règles Période 5 — Modèles">
          <p style={{ fontSize: 13, color: "#666", margin: "0 0 16px" }}>
            Cliquez sur une règle pour pré-remplir le formulaire de création.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {REGLES_P5.map((m, i) => {
              const dejaCreee = regles.some((r) => r.titre.includes(m.titre));
              return (
                <button
                  key={i}
                  onClick={() => !dejaCreee && utiliserModele(m)}
                  disabled={dejaCreee}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "12px 14px", borderRadius: 10,
                    border: dejaCreee ? "1px solid #E5E7EB" : "1px solid #C4B5FD",
                    background: dejaCreee ? "#F9FAFB" : "#FAFAFE",
                    cursor: dejaCreee ? "not-allowed" : "pointer",
                    opacity: dejaCreee ? 0.6 : 1,
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: dejaCreee ? "#999" : "#5B21B6" }}>
                      S{i + 1} — {m.titre}
                    </span>
                    {dejaCreee ? (
                      <span style={{ fontSize: 11, color: "#059669", fontWeight: 500 }}>Déjà créée</span>
                    ) : (
                      <span className="ms" style={{ fontSize: 16, color: "#7C3AED" }}>arrow_forward</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#666", marginTop: 4, lineHeight: 1.4 }}>
                    {m.astuce}
                  </div>
                </button>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}
