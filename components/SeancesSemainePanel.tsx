"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TYPE_BLOC_CONFIG, type TypeBloc } from "@/types";
import { MATIERES_CANONIQUES } from "@/lib/matieres-referentiel";
import type { SeanceTraduite } from "@/lib/seances-traduction";
import { appelPourSeance, empechement, titreDuBloc } from "@/lib/seances-generation";

/**
 * « Depuis ma programmation » — engendrer la semaine à partir des séances Notion.
 *
 * L'enseignant décrit déjà ses séances dans sa base « Programmation année en
 * cours » : matière, niveau, objectifs, et pour le français le corpus de la
 * semaine. Ce panneau lui évite de tout ressaisir : il n'a qu'à choisir le type
 * d'activité, relire, et poser les blocs sur la grille.
 *
 * Trois temps, dans cet ordre, parce que l'IA se trompe et qu'un exercice
 * fautif arrivé chez un CE2 coûte plus cher qu'une relecture :
 *   1. choisir  — cocher les séances, ajuster type et sous-domaine ;
 *   2. engendrer — un appel après l'autre, avec l'avancement visible ;
 *   3. relire   — chaque contenu, avant de le poser sur la semaine.
 */

const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

interface Groupe { id: string; nom: string }

interface BlocPret {
  type: TypeBloc;
  titre: string;
  jour: number;
  assignation: { groupeIds: string[]; eleveUids: string[]; groupeNoms: string[] };
  contenu: Record<string, unknown>;
}

interface Props {
  lundi: string;
  groupes: Groupe[];
  onFermer: () => void;
  /** Les blocs relus, à poser sur la grille de la semaine. */
  onBlocsPrets: (blocs: BlocPret[]) => void;
}

/** Une ligne de l'écran : une séance × un niveau, plus les choix de l'enseignant. */
interface Ligne extends SeanceTraduite {
  cle: string;
  choisie: boolean;
  type: string;
  /** Contenu engendré, une fois la génération passée. */
  statut: "attente" | "encours" | "ok" | "echec";
  contenu?: Record<string, unknown>;
  erreur?: string;
}

type Etape = "choix" | "generation" | "relecture";

export default function SeancesSemainePanel({ lundi, groupes, onFermer, onBlocsPrets }: Props) {
  const [etape, setEtape] = useState<Etape>("choix");
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avancement, setAvancement] = useState({ fait: 0, total: 0 });

  /* ── Chargement ───────────────────────────────────────────────────────── */

  useEffect(() => {
    let vivant = true;
    setChargement(true);
    setErreur(null);
    fetch(`/api/enseignant/seances-semaine?lundi=${lundi}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.erreur ?? "Programmation illisible");
        return j;
      })
      .then((j) => {
        if (!vivant) return;
        setLignes(
          (j.lignes as SeanceTraduite[]).map((s) => ({
            ...s,
            cle: `${s.seanceId}_${s.niveau}`,
            // Une séance de bilan n'est pas un devoir du soir : décochée d'office.
            choisie: !s.estEvaluation,
            type: s.typesSuggeres[0] ?? "exercice",
            statut: "attente" as const,
          }))
        );
      })
      .catch((e) => vivant && setErreur((e as Error).message))
      .finally(() => vivant && setChargement(false));
    return () => { vivant = false; };
  }, [lundi]);

  const majLigne = useCallback((cle: string, champs: Partial<Ligne>) => {
    setLignes((prev) => prev.map((l) => (l.cle === cle ? { ...l, ...champs } : l)));
  }, []);

  const choisies = useMemo(() => lignes.filter((l) => l.choisie), [lignes]);
  const engendrees = useMemo(() => lignes.filter((l) => l.statut === "ok"), [lignes]);

  /* ── Génération, une ligne après l'autre ──────────────────────────────── */

  // En série, et pas en parallèle : `generer-exercice` limite à 20 appels par
  // minute, une semaine chargée en demande une douzaine, et un échec isolé ne
  // doit pas emporter le lot.
  const engendrer = useCallback(async () => {
    const aFaire = lignes.filter((l) => l.choisie && l.statut !== "ok");
    setEtape("generation");
    setAvancement({ fait: 0, total: aFaire.length });

    for (const [i, ligne] of aFaire.entries()) {
      majLigne(ligne.cle, { statut: "encours", erreur: undefined });
      try {
        const appel = appelPourSeance(ligne, ligne.type);
        const res = await fetch(appel.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(appel.body),
        });
        const json = await res.json();
        if (!res.ok || json.erreur) throw new Error(json.erreur ?? `Erreur ${res.status}`);
        const contenu = appel.enveloppe === "resultat" ? json.resultat : json;
        if (!contenu) throw new Error("Réponse vide du générateur");
        majLigne(ligne.cle, { statut: "ok", contenu });
      } catch (e) {
        majLigne(ligne.cle, { statut: "echec", erreur: (e as Error).message });
      }
      setAvancement({ fait: i + 1, total: aFaire.length });
    }

    setEtape("relecture");
  }, [lignes, majLigne]);

  /* ── Pose sur la grille ───────────────────────────────────────────────── */

  const [pose, setPose] = useState(false);

  async function poser() {
    setPose(true);
    const blocs: BlocPret[] = [];

    for (const l of engendrees) {
      // Le niveau de la ligne désigne le groupe qui porte ce nom.
      const groupe = groupes.find((g) => g.nom.toUpperCase() === l.niveau.toUpperCase());
      const titre = titreDuBloc(l);

      // Matière et sous-matière voyagent avec le contenu : c'est le seul
      // endroit où le suivi pourra les retrouver, `chapitre_id` restant nul
      // sur les blocs du plan de travail.
      const contenu = {
        ...(l.contenu ?? {}),
        matiere: l.matiere,
        sous_matiere: l.sousMatiere,
        genere_par_ia: true,
        genere_depuis_seance: l.seanceId,
      };

      // La banque rend l'exercice repiochable plus tard. Son échec ne doit rien
      // emporter : le contenu voyage aussi en clair dans le bloc, donc la
      // semaine se planifie même si la banque refuse.
      try {
        await fetch("/api/admin/exercices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: l.type, matiere: l.matiere, sous_matiere: l.sousMatiere,
            titre, contenu,
          }),
        });
      } catch (e) {
        console.warn("[seances] mise en banque échouée :", e);
      }

      blocs.push({
        type: l.type as TypeBloc,
        titre,
        jour: l.jour,
        assignation: groupe
          ? { groupeIds: [groupe.id], eleveUids: [], groupeNoms: [groupe.nom] }
          : { groupeIds: [], eleveUids: [], groupeNoms: [] },
        contenu,
      });
    }

    onBlocsPrets(blocs);
    onFermer();
  }

  /* ── Rendu ────────────────────────────────────────────────────────────── */

  return (
    <div style={fondModale} onClick={onFermer}>
      <div style={cadreModale} onClick={(e) => e.stopPropagation()}>
        <header style={enTete}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "var(--pb-on-surface)" }}>
              Depuis ma programmation
            </h3>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--pb-on-surface-variant)" }}>
              {etape === "choix" && "Cochez les séances, choisissez le type d'activité."}
              {etape === "generation" && `Génération ${avancement.fait} / ${avancement.total}…`}
              {etape === "relecture" && "Relisez avant de poser les blocs sur la semaine."}
            </p>
          </div>
          <button onClick={onFermer} className="btn-ghost" style={{ padding: "6px 12px" }}>Fermer</button>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {chargement && <div className="skeleton" style={{ height: 160, borderRadius: 12 }} />}

          {erreur && (
            <div style={encartErreur}>
              <p style={{ margin: 0, fontWeight: 700 }}>Programmation injoignable</p>
              <p style={{ margin: "6px 0 0", fontSize: 13 }}>{erreur}</p>
              <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--pb-on-surface-variant)" }}>
                La semaine reste planifiable à la main, comme d&apos;habitude.
              </p>
            </div>
          )}

          {!chargement && !erreur && lignes.length === 0 && (
            <p style={{ padding: 30, textAlign: "center", fontSize: 13, color: "var(--pb-on-surface-variant)" }}>
              Aucune séance de maths ou de français pour cette semaine.
            </p>
          )}

          {!chargement && !erreur && lignes.length > 0 && (
            <>
              {etape === "choix" && (
                // Une semaine entière fait une vingtaine de lignes et quelques
                // minutes de génération : commencer par tout décocher est le
                // geste le plus fréquent.
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  <button
                    onClick={() => setLignes((p) => p.map((l) => ({ ...l, choisie: true })))}
                    className="btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}
                  >
                    Tout cocher
                  </button>
                  <button
                    onClick={() => setLignes((p) => p.map((l) => ({ ...l, choisie: false })))}
                    className="btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}
                  >
                    Tout décocher
                  </button>
                </div>
              )}
              <ListeLignes lignes={lignes} etape={etape} onMaj={majLigne} />
            </>
          )}
        </div>

        <footer style={piedModale}>
          {etape === "choix" && (
            <>
              <span style={{ fontSize: 13, color: "var(--pb-on-surface-variant)" }}>
                <strong style={{ color: "var(--pb-on-surface)" }}>{choisies.length}</strong> séance(s) retenue(s)
                {choisies.length > 6 && " — comptez environ " + Math.ceil(choisies.length * 15 / 60) + " min"}
              </span>
              <button
                onClick={engendrer}
                disabled={choisies.length === 0}
                className="pb-btn primary"
                style={{ padding: "10px 24px", borderRadius: 10 }}
              >
                Engendrer les {choisies.length} exercices
              </button>
            </>
          )}

          {etape === "generation" && (
            <div style={{ flex: 1 }}>
              <div style={{ height: 6, background: "var(--pb-surface-container)", borderRadius: 999 }}>
                <div style={{
                  height: "100%", borderRadius: 999, background: "var(--pb-primary)",
                  width: `${avancement.total ? (avancement.fait / avancement.total) * 100 : 0}%`,
                  transition: "width .3s",
                }} />
              </div>
            </div>
          )}

          {etape === "relecture" && (
            <>
              <span style={{ fontSize: 13, color: "var(--pb-on-surface-variant)" }}>
                <strong style={{ color: "var(--pb-on-surface)" }}>{engendrees.length}</strong> exercice(s) prêt(s)
                {lignes.some((l) => l.statut === "echec") &&
                  ` · ${lignes.filter((l) => l.statut === "echec").length} en échec`}
              </span>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setEtape("choix")} className="pb-btn">← Revenir au choix</button>
                <button
                  onClick={poser}
                  disabled={engendrees.length === 0 || pose}
                  className="pb-btn primary"
                  style={{ padding: "10px 24px", borderRadius: 10 }}
                >
                  {pose ? "Enregistrement…" : "Poser sur la semaine"}
                </button>
              </div>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

/* ── La liste, groupée par jour ───────────────────────────────────────────── */

function ListeLignes({
  lignes, etape, onMaj,
}: {
  lignes: Ligne[];
  etape: Etape;
  onMaj: (cle: string, champs: Partial<Ligne>) => void;
}) {
  const parJour = new Map<number, Ligne[]>();
  for (const l of lignes) {
    if (!parJour.has(l.jour)) parJour.set(l.jour, []);
    parJour.get(l.jour)!.push(l);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {[...parJour.entries()].sort((a, b) => a[0] - b[0]).map(([jour, duJour]) => (
        <section key={jour}>
          <p style={titreJour}>{JOURS[jour] ?? `Jour ${jour + 1}`}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {duJour.map((l) => (
              <LigneSeance key={l.cle} ligne={l} etape={etape} onMaj={onMaj} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function LigneSeance({
  ligne: l, etape, onMaj,
}: {
  ligne: Ligne;
  etape: Etape;
  onMaj: (cle: string, champs: Partial<Ligne>) => void;
}) {
  const [deplie, setDeplie] = useState(false);
  const bloquant = empechement(l, l.type);
  const sousDomaines = MATIERES_CANONIQUES[l.matiere] ?? [];

  return (
    <div style={{
      border: `1px solid ${l.statut === "echec" ? "#f0b8b8" : "var(--pb-outline-variant)"}`,
      borderRadius: 14,
      padding: "10px 12px",
      background: l.choisie ? "var(--pb-surface-lowest)" : "transparent",
      opacity: l.choisie ? 1 : 0.6,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        {etape === "choix" && (
          <input
            type="checkbox"
            checked={l.choisie}
            onChange={(e) => onMaj(l.cle, { choisie: e.target.checked })}
            style={{ marginTop: 4, width: 17, height: 17, flexShrink: 0 }}
            aria-label={`Retenir ${l.titre}`}
          />
        )}

        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--pb-on-surface)" }}>
            {titreDuBloc(l)}
            {l.estEvaluation && <span style={etiquetteEval}>bilan</span>}
          </p>
          <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--pb-on-surface-variant)" }}>
            {l.niveau} · {l.difficulte}
            {l.corpus && " · corpus disponible"}
          </p>
          {l.objectifs && (
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--pb-on-surface-variant)", lineHeight: 1.35 }}>
              {deplie ? l.objectifs : l.objectifs.slice(0, 110) + (l.objectifs.length > 110 ? "…" : "")}
            </p>
          )}
        </div>

        {etape === "choix" && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {/* Le sous-domaine est modifiable ici : c'est le seul endroit où
                corriger une grammaire qui est en fait de l'orthographe, ou un
                sous-domaine de maths CE2 déduit faute de code de chapitre. */}
            <select
              value={l.sousMatiere}
              onChange={(e) => onMaj(l.cle, { sousMatiere: e.target.value, sousMatiereIncertaine: false })}
              className="form-input"
              style={{
                ...petitChamp,
                borderColor: l.sousMatiereIncertaine ? "var(--warning)" : undefined,
              }}
              title={l.sousMatiereIncertaine ? "Déduit faute de mieux — à confirmer" : undefined}
            >
              {sousDomaines.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            <select
              value={l.type}
              onChange={(e) => onMaj(l.cle, { type: e.target.value })}
              className="form-input"
              style={petitChamp}
            >
              {l.typesSuggeres.map((t) => (
                <option key={t} value={t}>
                  {TYPE_BLOC_CONFIG[t as TypeBloc]?.libelle ?? t}
                </option>
              ))}
            </select>
          </div>
        )}

        {etape !== "choix" && <Etat ligne={l} onDeplier={() => setDeplie(!deplie)} deplie={deplie} />}
      </div>

      {l.sousMatiereIncertaine && etape === "choix" && (
        <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--warning)" }}>
          Sous-domaine déduit — vérifiez-le, le suivi s&apos;appuiera dessus.
        </p>
      )}

      {bloquant && l.choisie && etape === "choix" && (
        <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--error)" }}>{bloquant}</p>
      )}

      {l.statut === "echec" && (
        <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--error)" }}>{l.erreur}</p>
      )}

      {deplie && l.contenu && <ApercuContenu contenu={l.contenu} />}
    </div>
  );
}

function Etat({ ligne: l, onDeplier, deplie }: { ligne: Ligne; onDeplier: () => void; deplie: boolean }) {
  if (l.statut === "encours") {
    return <span style={{ fontSize: 12, color: "var(--pb-on-surface-variant)" }}>en cours…</span>;
  }
  if (l.statut === "ok") {
    return (
      <button onClick={onDeplier} className="btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }}>
        {deplie ? "Replier" : "Relire"}
      </button>
    );
  }
  if (l.statut === "echec") {
    return <span style={{ fontSize: 12, color: "var(--error)", fontWeight: 700 }}>échec</span>;
  }
  return <span style={{ fontSize: 12, color: "var(--pb-outline)" }}>—</span>;
}

/**
 * Aperçu compact du contenu engendré.
 *
 * Volontairement resserré : sur une semaine complète, une douzaine d'aperçus
 * complets seraient illisibles. On montre la consigne et les premières
 * questions — de quoi juger si l'exercice porte bien sur la notion.
 */
function ApercuContenu({ contenu }: { contenu: Record<string, unknown> }) {
  const consigne = typeof contenu.consigne === "string" ? contenu.consigne : null;
  const items =
    (contenu.questions as unknown[]) ??
    (contenu.calculs as unknown[]) ??
    (contenu.trous as unknown[]) ??
    (contenu.paires as unknown[]) ??
    (contenu.phrases as unknown[]) ??
    (contenu.problemes as unknown[]) ??
    (contenu.series as unknown[]) ??
    [];

  const enonce = (o: unknown): string => {
    const q = o as Record<string, unknown>;
    return String(q.enonce ?? q.question ?? q.texte ?? q.mot ?? q.gauche ?? JSON.stringify(o)).slice(0, 120);
  };

  return (
    <div style={{ marginTop: 10, padding: "10px 12px", background: "var(--pb-surface-low)", borderRadius: 10 }}>
      {consigne && (
        <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "var(--pb-on-surface)" }}>
          {consigne}
        </p>
      )}
      <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
        {items.slice(0, 4).map((o, i) => (
          <li key={i} style={{ fontSize: 12, color: "var(--pb-on-surface-variant)" }}>{enonce(o)}</li>
        ))}
      </ol>
      {items.length > 4 && (
        <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--pb-outline)" }}>
          … et {items.length - 4} de plus
        </p>
      )}
      {typeof contenu.texte_complet === "string" && (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--pb-on-surface-variant)", lineHeight: 1.4 }}>
          {(contenu.texte_complet as string).slice(0, 220)}…
        </p>
      )}
    </div>
  );
}

/* ── Styles ───────────────────────────────────────────────────────────────── */

const fondModale: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 200,
  background: "rgba(10,12,40,0.45)", backdropFilter: "blur(2px)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
};

const cadreModale: React.CSSProperties = {
  background: "var(--pb-surface-lowest)", borderRadius: 20,
  width: "min(920px, 100%)", maxHeight: "88vh",
  display: "flex", flexDirection: "column", overflow: "hidden",
  boxShadow: "0 24px 64px rgba(0,0,0,0.28)",
};

const enTete: React.CSSProperties = {
  display: "flex", alignItems: "flex-start", justifyContent: "space-between",
  gap: 16, padding: "18px 20px", borderBottom: "1px solid var(--pb-outline-variant)",
};

const piedModale: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
  padding: "14px 20px", borderTop: "1px solid var(--pb-outline-variant)",
};

const titreJour: React.CSSProperties = {
  margin: "0 0 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
  textTransform: "uppercase", color: "var(--pb-on-surface-variant)",
};

const petitChamp: React.CSSProperties = {
  padding: "5px 8px", fontSize: 12, width: "auto", marginBottom: 0,
};

const etiquetteEval: React.CSSProperties = {
  marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
  background: "var(--pb-surface-container)", color: "var(--pb-on-surface-variant)",
};

const encartErreur: React.CSSProperties = {
  padding: "14px 16px", borderRadius: 12,
  border: "1px solid #f0b8b8", background: "#fff5f5", color: "var(--error)",
};
