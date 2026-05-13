"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { Chapitre } from "@/types";

/**
 * Matières et sous-matières canoniques toujours proposées dans les
 * formulaires. L'ordre des entrées (et des sous-matières dans chaque
 * matière) est celui affiché à l'enseignant.
 */
export const MATIERES_CANONIQUES: Record<string, string[]> = {
  "Mathématiques": ["Calcul", "Numération", "Grandeurs et mesures", "Géométrie"],
  "Français": ["Lecture", "Écriture", "Conjugaison", "Grammaire", "Orthographe", "Vocabulaire"],
  "Anglais": [],
  "Histoire": [],
  "Géographie": [],
  "Sciences": [],
};
const MATIERES_ORDRE = Object.keys(MATIERES_CANONIQUES);

export interface MatiereChapitreValue {
  matiere: string;
  sousMatiere: string;
  chapitreId: string;
  chapitreTitre: string;
}

interface Props {
  value: MatiereChapitreValue;
  onChange: (v: MatiereChapitreValue) => void;
  /** Matière à pré-sélectionner si la valeur est vide (sinon, premier de la liste). */
  matiereParDefaut?: string;
  /** Si défini, pré-sélectionne ce chapitre au chargement. */
  defaultChapitreId?: string;
  /** Cache la ligne sous-matière (utile pour des types qui n'en ont pas besoin). */
  cacherSousMatiere?: boolean;
  /** Cache le sélecteur de chapitre (pour types thématiques sans chapitre). */
  cacherChapitre?: boolean;
}

export default function MatiereChapitreSelector({
  value,
  onChange,
  matiereParDefaut,
  defaultChapitreId,
  cacherSousMatiere = false,
  cacherChapitre = false,
}: Props) {
  const supabase = createClient();

  const [chapitres, setChapitres] = useState<Chapitre[]>([]);
  const [matieresDispo, setMatieresDispo] = useState<string[]>([]);
  const [sousMatierePerso, setSousMatierePerso] = useState<string>("");
  const [sousMatiereMode, setSousMatiereMode] = useState<"liste" | "perso">("liste");
  const [showCreerChapitre, setShowCreerChapitre] = useState(false);
  const [nouveauChapitreNom, setNouveauChapitreNom] = useState("");
  const [creationEnCours, setCreationEnCours] = useState(false);

  // Charge les matières disponibles au montage (canoniques + extras BDD)
  useEffect(() => {
    supabase
      .from("chapitres")
      .select("matiere")
      .then(({ data }) => {
        const dbMatieres = Array.from(new Set((data ?? []).map((c: { matiere: string }) => c.matiere)));
        const extras = dbMatieres.filter(m => !MATIERES_ORDRE.includes(m)).sort();
        const ms = [...MATIERES_ORDRE, ...extras];
        setMatieresDispo(ms);
        if (!value.matiere) {
          const initiale = matiereParDefaut && ms.includes(matiereParDefaut)
            ? matiereParDefaut
            : ms[0] ?? "";
          if (initiale) onChange({ ...value, matiere: initiale });
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recharge les chapitres à chaque changement de matière
  useEffect(() => {
    if (!value.matiere) return;
    supabase
      .from("chapitres")
      .select("*")
      .eq("matiere", value.matiere)
      .order("ordre", { nullsFirst: false })
      .order("titre")
      .then(({ data }) => {
        const liste = (data ?? []) as Chapitre[];
        setChapitres(liste);
        const targetId = value.chapitreId && liste.find(c => c.id === value.chapitreId)
          ? value.chapitreId
          : defaultChapitreId && liste.find(c => c.id === defaultChapitreId)
            ? defaultChapitreId
            : "";
        const cible = liste.find(c => c.id === targetId);
        onChange({
          matiere: value.matiere,
          sousMatiere: "",
          chapitreId: targetId,
          chapitreTitre: cible?.titre ?? "",
        });
        setSousMatiereMode("liste");
        setSousMatierePerso("");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.matiere, defaultChapitreId]);

  async function creerChapitre() {
    if (!nouveauChapitreNom.trim() || !value.matiere) return;
    setCreationEnCours(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;
      const { data, error } = await supabase
        .from("chapitres")
        .insert({
          titre: nouveauChapitreNom.trim(),
          matiere: value.matiere,
          sous_matiere: value.sousMatiere || null,
          enseignant_id: user.user.id,
        })
        .select()
        .single();
      if (error) { alert("Erreur : " + error.message); return; }
      const nouveau = data as Chapitre;
      setChapitres(prev => [...prev, nouveau]);
      onChange({ ...value, chapitreId: nouveau.id, chapitreTitre: nouveau.titre });
      setNouveauChapitreNom("");
      setShowCreerChapitre(false);
    } finally {
      setCreationEnCours(false);
    }
  }

  // Sous-matières : canoniques de la matière + extras trouvés en BDD (ordre conservé)
  const sousMatieresCanoniques = MATIERES_CANONIQUES[value.matiere] ?? [];
  const sousMatieresDB = Array.from(
    new Set(chapitres.filter(c => c.sous_matiere).map(c => c.sous_matiere as string))
  );
  const extrasDB = sousMatieresDB.filter(sm => !sousMatieresCanoniques.includes(sm)).sort();
  const sousMatieresDispo = [...sousMatieresCanoniques, ...extrasDB];

  const chapitresFiltres = value.sousMatiere
    ? chapitres.filter(c => c.sous_matiere === value.sousMatiere)
    : chapitres;

  return (
    <>
      {/* Matière */}
      <div className="form-group">
        <label className="form-label">Matière</label>
        <select
          className="form-input"
          value={value.matiere}
          onChange={(e) => onChange({ ...value, matiere: e.target.value, sousMatiere: "", chapitreId: "", chapitreTitre: "" })}
        >
          {matieresDispo.length === 0 && <option value="">Chargement…</option>}
          {matieresDispo.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {/* Sous-matière (liste + Personnalisé) */}
      {!cacherSousMatiere && (
        <div className="form-group">
          <label className="form-label">
            Sous-matière <span className="text-secondary">(optionnel)</span>
          </label>
          <select
            className="form-input"
            value={sousMatiereMode === "perso" ? "__perso__" : value.sousMatiere}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__perso__") {
                setSousMatiereMode("perso");
                onChange({ ...value, sousMatiere: sousMatierePerso, chapitreId: "", chapitreTitre: "" });
                return;
              }
              setSousMatiereMode("liste");
              const filtered = v ? chapitres.filter(c => c.sous_matiere === v) : chapitres;
              const premier = filtered[0];
              onChange({
                ...value,
                sousMatiere: v,
                chapitreId: premier?.id ?? "",
                chapitreTitre: premier?.titre ?? "",
              });
            }}
          >
            <option value="">Toutes les sous-matières</option>
            {sousMatieresDispo.map((sm) => (
              <option key={sm} value={sm}>{sm}</option>
            ))}
            <option value="__perso__">➕ Personnalisé…</option>
          </select>
          {sousMatiereMode === "perso" && (
            <input
              type="text"
              className="form-input"
              value={sousMatierePerso}
              onChange={(e) => {
                setSousMatierePerso(e.target.value);
                onChange({ ...value, sousMatiere: e.target.value });
              }}
              placeholder="Ex. Conjugaison, Numération, Géométrie…"
              style={{ marginTop: 8 }}
              autoFocus
            />
          )}
        </div>
      )}

      {/* Chapitre */}
      {!cacherChapitre && (
        <div className="form-group">
          <label className="form-label">
            Chapitre <span style={{ color: "var(--text-secondary)", fontSize: 12, fontWeight: 400 }}>(optionnel)</span>
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
            <select
              className="form-input"
              value={value.chapitreId}
              onChange={(e) => {
                const id = e.target.value;
                const ch = chapitres.find(c => c.id === id);
                onChange({ ...value, chapitreId: id, chapitreTitre: ch?.titre ?? "" });
              }}
              style={{ flex: 1 }}
            >
              <option value="">— Sans chapitre —</option>
              {chapitresFiltres.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.sous_matiere && !value.sousMatiere ? `[${c.sous_matiere}] ` : ""}{c.titre}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowCreerChapitre(!showCreerChapitre)}
              style={{
                padding: "0 14px", borderRadius: 8, border: "1.5px solid var(--primary)",
                background: showCreerChapitre ? "var(--primary)" : "transparent",
                color: showCreerChapitre ? "white" : "var(--primary)",
                cursor: "pointer", fontWeight: 700, fontSize: 18, lineHeight: 1,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
              }}
              title="Créer un nouveau chapitre"
            >
              +
            </button>
          </div>

          {showCreerChapitre && (
            <div style={{
              marginTop: 10, padding: "12px 16px",
              background: "var(--blue-50, #EFF6FF)", border: "1.5px solid var(--blue-200, #BFDBFE)",
              borderRadius: 10, display: "flex", gap: 8, alignItems: "center",
            }}>
              <input
                type="text"
                className="form-input"
                placeholder="Nom du nouveau chapitre"
                value={nouveauChapitreNom}
                onChange={(e) => setNouveauChapitreNom(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); creerChapitre(); } }}
                style={{ flex: 1, marginBottom: 0 }}
                autoFocus
              />
              <button
                type="button"
                onClick={creerChapitre}
                disabled={!nouveauChapitreNom.trim() || creationEnCours}
                className="pb-btn primary"
                style={{ padding: "8px 16px", fontSize: 13, borderRadius: 8, whiteSpace: "nowrap" }}
              >
                {creationEnCours ? "…" : "Créer"}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
