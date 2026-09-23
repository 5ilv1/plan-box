"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TYPE_BLOC_CONFIG, type TypeBloc } from "@/types";
import { MATIERES_CANONIQUES } from "@/lib/matieres-referentiel";
import { typesSuggeres, type SeanceTraduite } from "@/lib/seances-traduction";
import { appelPourSeance, empechement, titreDuBloc } from "@/lib/seances-generation";
import { effacerBrouillon, fusionnerBrouillon, lireBrouillon, sauverBrouillon } from "@/lib/brouillon-seances";

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
  /** Exercices retrouvés dans le brouillon après une fermeture inattendue. */
  const [retrouves, setRetrouves] = useState(0);

  // Le brouillon ne s'écrit qu'une fois RELU : au montage la liste est vide,
  // et l'enregistrer aussitôt effacerait précisément ce qu'on veut retrouver.
  const brouillonActif = useRef(false);
  const minuterieBrouillon = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        const fraiches: Ligne[] = (j.lignes as SeanceTraduite[]).map((s) => ({
          ...s,
          cle: `${s.seanceId}_${s.volet}_${s.niveau}`,
          // Une séance de bilan n'est pas un devoir du soir : décochée d'office.
          choisie: !s.estEvaluation,
          type: s.typesSuggeres[0] ?? "exercice",
          statut: "attente" as const,
        }));
        // Un travail engendré puis perdu dans un rechargement revient ici,
        // sur les mêmes séances, en relecture.
        const { lignes: fusionnees, retrouves: n } = fusionnerBrouillon(fraiches, lireBrouillon(lundi));
        setLignes(fusionnees);
        if (n > 0) {
          setRetrouves(n);
          setEtape("relecture");
        }
        brouillonActif.current = true;
      })
      .catch((e) => vivant && setErreur((e as Error).message))
      .finally(() => vivant && setChargement(false));
    return () => { vivant = false; };
  }, [lundi]);

  // Groupé : la relecture modifie le contenu à chaque frappe.
  useEffect(() => {
    if (!brouillonActif.current) return;
    if (minuterieBrouillon.current) clearTimeout(minuterieBrouillon.current);
    minuterieBrouillon.current = setTimeout(() => {
      if (brouillonActif.current) sauverBrouillon(lundi, lignes);
    }, 400);
  }, [lignes, lundi]);

  useEffect(() => () => {
    if (minuterieBrouillon.current) clearTimeout(minuterieBrouillon.current);
  }, []);

  // Un rechargement pendant la génération couperait la boucle en plein vol :
  // les exercices déjà faits reviendraient par le brouillon, mais les suivants
  // ne seraient jamais demandés. Le navigateur demande donc confirmation.
  useEffect(() => {
    if (etape !== "generation") return;
    const retenir = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", retenir);
    return () => window.removeEventListener("beforeunload", retenir);
  }, [etape]);

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

  /** Refaire une ligne seule, sans relancer tout le lot. */
  const regenerer = useCallback(async (cle: string) => {
    const ligne = lignes.find((l) => l.cle === cle);
    if (!ligne) return;
    majLigne(cle, { statut: "encours", erreur: undefined });
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
      majLigne(cle, { statut: "ok", contenu });
    } catch (e) {
      majLigne(cle, { statut: "echec", erreur: (e as Error).message });
    }
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
    // Les blocs sont sur la grille : le brouillon n'a plus d'objet, et le
    // garder ferait réapparaître des exercices déjà posés.
    brouillonActif.current = false;
    if (minuterieBrouillon.current) clearTimeout(minuterieBrouillon.current);
    effacerBrouillon(lundi);
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
              {retrouves > 0 && etape === "relecture" && (
                <div style={encartRetrouve}>
                  <strong>{retrouves} exercice{retrouves > 1 ? "s" : ""} retrouvé{retrouves > 1 ? "s" : ""}.</strong>{" "}
                  La page s&apos;était fermée avant que vous ne les posiez sur la semaine.
                  {lignes.some((l) => l.choisie && l.statut === "attente") &&
                    " Certaines séances n'avaient pas encore été engendrées : « Revenir au choix » pour les reprendre."}
                </div>
              )}
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
              <ListeLignes lignes={lignes} etape={etape} onMaj={majLigne} onRegenerer={regenerer} />
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
                disabled={choisies.filter((l) => l.statut !== "ok").length === 0}
                className="pb-btn primary"
                style={{ padding: "10px 24px", borderRadius: 10 }}
              >
                {(() => {
                  const restants = choisies.filter((l) => l.statut !== "ok").length;
                  return restants < choisies.length
                    ? `Engendrer les ${restants} restant${restants > 1 ? "s" : ""}`
                    : `Engendrer les ${choisies.length} exercices`;
                })()}
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
  lignes, etape, onMaj, onRegenerer,
}: {
  lignes: Ligne[];
  etape: Etape;
  onMaj: (cle: string, champs: Partial<Ligne>) => void;
  onRegenerer: (cle: string) => void;
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
              <LigneSeance key={l.cle} ligne={l} etape={etape} onMaj={onMaj} onRegenerer={onRegenerer} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function LigneSeance({
  ligne: l, etape, onMaj, onRegenerer,
}: {
  ligne: Ligne;
  etape: Etape;
  onMaj: (cle: string, champs: Partial<Ligne>) => void;
  onRegenerer: (cle: string) => void;
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
              onChange={(e) => {
                // Les types proposés dépendent du sous-domaine : les recalculer,
                // sinon corriger « Numération » en « Calcul » laisserait la
                // liste des types figée sur l'ancienne suggestion.
                const types = typesSuggeres(e.target.value, l.estEvaluation);
                onMaj(l.cle, {
                  sousMatiere: e.target.value,
                  sousMatiereIncertaine: false,
                  typesSuggeres: types,
                  type: types.includes(l.type) ? l.type : types[0],
                });
              }}
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

        {etape !== "choix" && (
          <Etat
            ligne={l}
            deplie={deplie}
            onDeplier={() => setDeplie(!deplie)}
            onRegenerer={() => onRegenerer(l.cle)}
          />
        )}
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

      {deplie && l.contenu && (
        <ApercuContenu
          contenu={l.contenu}
          onChange={(c) => onMaj(l.cle, { contenu: c })}
        />
      )}
    </div>
  );
}

function Etat({
  ligne: l, onDeplier, deplie, onRegenerer,
}: {
  ligne: Ligne;
  onDeplier: () => void;
  deplie: boolean;
  onRegenerer: () => void;
}) {
  if (l.statut === "encours") {
    return <span style={{ fontSize: 12, color: "var(--pb-on-surface-variant)" }}>en cours…</span>;
  }
  if (l.statut === "ok" || l.statut === "echec") {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        {l.statut === "ok" && (
          <button onClick={onDeplier} className="btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }}>
            {deplie ? "Replier" : "Relire"}
          </button>
        )}
        {/* La sortie de secours quand le contenu ne va pas et que les positions
            calculées interdisent de le corriger à la main. */}
        <button onClick={onRegenerer} className="btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }}>
          Régénérer
        </button>
      </div>
    );
  }
  return <span style={{ fontSize: 12, color: "var(--pb-outline)" }}>—</span>;
}

/**
 * L'exercice en entier, et modifiable.
 *
 * Volontairement complet : l'enseignant ne peut décider d'envoyer un exercice à
 * ses élèves qu'en le lisant en entier. Un aperçu tronqué n'est pas une
 * relecture.
 *
 * Ce qui est modifiable et ce qui ne l'est pas n'est pas arbitraire :
 *   - titre, consigne, énoncés et réponses attendues : oui ;
 *   - la position des trous d'un texte à trous et les bornes des groupes d'une
 *     analyse de phrase : **non**. Ce sont des index calculés sur le texte ;
 *     les toucher à la main désynchroniserait l'exercice et l'élève se
 *     retrouverait devant une réponse impossible. Pour ces cas-là, régénérer.
 */
function ApercuContenu({
  contenu,
  onChange,
}: {
  contenu: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const maj = (champ: string, valeur: unknown) => onChange({ ...contenu, [champ]: valeur });

  /** Le tableau d'items, et sous quelle clé il vit. */
  const cle = ["questions", "calculs", "trous", "paires", "items", "series", "phrases", "problemes"]
    .find((k) => Array.isArray(contenu[k]));
  const items = (cle ? (contenu[cle] as Record<string, unknown>[]) : []) ?? [];

  const majItem = (i: number, champ: string, valeur: string) => {
    if (!cle) return;
    const copie = [...items];
    copie[i] = { ...copie[i], [champ]: valeur };
    maj(cle, copie);
  };

  // Les index calculés ne se retouchent pas à la main.
  const figé = cle === "trous" || cle === "phrases";

  return (
    <div style={{ marginTop: 10, padding: "12px 14px", background: "var(--pb-surface-low)", borderRadius: 10 }}>
      {typeof contenu.titre === "string" && (
        <Champ libelle="Titre" valeur={contenu.titre} onChange={(v) => maj("titre", v)} />
      )}
      {typeof contenu.consigne === "string" && (
        <Champ libelle="Consigne" valeur={contenu.consigne} onChange={(v) => maj("consigne", v)} lignes={2} />
      )}

      {/* Le texte support : lecture seule quand des positions en dépendent. */}
      {typeof contenu.texte_complet === "string" && (
        <Champ libelle="Texte" valeur={contenu.texte_complet} lignes={5} lectureSeule
               aide="La position des trous est calculée sur ce texte : le modifier ici casserait l'exercice. Régénérez plutôt." />
      )}
      {typeof contenu.texte === "string" && (
        <Champ libelle="Texte" valeur={contenu.texte} onChange={(v) => maj("texte", v)} lignes={5} />
      )}

      {items.length > 0 && (
        <>
          <p style={etiquetteChamp}>
            {items.length} élément{items.length > 1 ? "s" : ""}
            {figé && " — lecture seule"}
          </p>
          <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((o, i) => (
              <li key={i}>
                <ItemEditable item={o} figé={figé}
                  onChange={(champ, v) => majItem(i, champ, v)} />
              </li>
            ))}
          </ol>
          {figé && (
            <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--pb-on-surface-variant)" }}>
              Les positions sont calculées sur le texte : pour corriger, régénérez l&apos;exercice.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Une ligne d'item : son énoncé et, quand elle existe, sa réponse attendue. */
function ItemEditable({
  item, figé, onChange,
}: {
  item: Record<string, unknown>;
  figé: boolean;
  onChange: (champ: string, valeur: string) => void;
}) {
  // Chaque type nomme ses champs autrement : on prend le premier qui existe.
  const champEnonce = ["enonce", "question", "texte", "mot", "gauche"].find((c) => typeof item[c] === "string");
  const champReponse = ["reponse_attendue", "reponse", "categorie", "signe", "resultat_attendu"]
    .find((c) => typeof item[c] === "string" || typeof item[c] === "number");

  const options = Array.isArray(item.options) ? item.options as string[]
    : Array.isArray(item.choix) ? item.choix as string[] : null;
  const bonne = typeof item.reponse_correcte === "number" ? item.reponse_correcte
    : typeof item.reponse === "number" ? item.reponse : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {champEnonce && (
        <textarea
          value={String(item[champEnonce])}
          onChange={(e) => onChange(champEnonce, e.target.value)}
          readOnly={figé}
          rows={1}
          style={{ ...champTexte, background: figé ? "transparent" : "var(--pb-surface-lowest)" }}
        />
      )}

      {options ? (
        <ul style={{ margin: "2px 0 0", paddingLeft: 16, listStyle: "none" }}>
          {options.map((o, k) => (
            <li key={k} style={{ fontSize: 11, color: k === bonne ? "var(--success)" : "var(--pb-on-surface-variant)", fontWeight: k === bonne ? 700 : 400 }}>
              {k === bonne ? "● " : "○ "}{o}
            </li>
          ))}
        </ul>
      ) : champReponse ? (
        <input
          value={String(item[champReponse])}
          onChange={(e) => onChange(champReponse, e.target.value)}
          readOnly={figé}
          style={{ ...champTexte, maxWidth: 260, background: figé ? "transparent" : "var(--pb-surface-lowest)" }}
          placeholder="Réponse attendue"
        />
      ) : null}

      {/* Les groupes d'une analyse de phrase : montrés, jamais retouchés. */}
      {Array.isArray(item.groupes) && (
        <p style={{ margin: 0, fontSize: 11, color: "var(--pb-on-surface-variant)" }}>
          {(item.groupes as Record<string, unknown>[])
            .map((g) => `${g.mots} → ${g.fonction}`).join(" · ")}
        </p>
      )}
      {Array.isArray(item.elements) && (
        <p style={{ margin: 0, fontSize: 11, color: "var(--pb-on-surface-variant)" }}>
          {(item.elements as string[]).join(" · ")}
        </p>
      )}
    </div>
  );
}

function Champ({
  libelle, valeur, onChange, lignes = 1, lectureSeule, aide,
}: {
  libelle: string;
  valeur: string;
  onChange?: (v: string) => void;
  lignes?: number;
  lectureSeule?: boolean;
  aide?: string;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <p style={etiquetteChamp}>{libelle}</p>
      <textarea
        value={valeur}
        onChange={(e) => onChange?.(e.target.value)}
        readOnly={lectureSeule || !onChange}
        rows={lignes}
        style={{ ...champTexte, background: lectureSeule ? "transparent" : "var(--pb-surface-lowest)" }}
      />
      {aide && <p style={{ margin: "3px 0 0", fontSize: 10, color: "var(--pb-on-surface-variant)" }}>{aide}</p>}
    </div>
  );
}

const etiquetteChamp: React.CSSProperties = {
  margin: "0 0 3px", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
  textTransform: "uppercase", color: "var(--pb-on-surface-variant)",
};

const champTexte: React.CSSProperties = {
  width: "100%", fontSize: 12, lineHeight: 1.45, padding: "6px 8px",
  border: "1px solid var(--pb-outline-variant)", borderRadius: 8,
  fontFamily: "inherit", color: "var(--pb-on-surface)", resize: "vertical",
};

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

const encartRetrouve: React.CSSProperties = {
  padding: "12px 16px", borderRadius: 12, marginBottom: 14, fontSize: 13, lineHeight: 1.5,
  border: "1px solid var(--pb-outline-variant)", background: "var(--pb-surface-container)",
  color: "var(--pb-on-surface)",
};
