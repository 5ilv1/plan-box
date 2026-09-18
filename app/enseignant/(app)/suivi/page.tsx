"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

import { Carte, EtatVide, Repliable } from "@/components/suivi/Carte";
import { KpiTuile } from "@/components/suivi/KpiTuile";
import { GrapheNiveaux, GrapheParJour } from "@/components/suivi/GrapheCompletion";
import GrapheCompletionEleves, { type LigneEleve } from "@/components/suivi/GrapheCompletionEleves";
import GrapheMatieres, { type LigneMatiere } from "@/components/suivi/GrapheMatieres";
import GrapheEvolution, { type LigneSemaine } from "@/components/suivi/GrapheEvolution";
import GrapheProgrammation, { type Part } from "@/components/suivi/GrapheProgrammation";
import {
  ElevesASurveiller, QuestionsRatees, RepartitionCeintures,
  type EleveAlerte, type PartCeinture, type QuestionRatee,
} from "@/components/suivi/ListesSuivi";
import AnalyseIA from "@/components/suivi/AnalyseIA";
import MatriceJour from "@/components/suivi/MatriceJour";
import ProgressionChapitres from "@/components/suivi/ProgressionChapitres";
import { ENCRE, ENCRE_DOUCE, ETAT, couleurScore, pct } from "@/components/suivi/theme-charts";

/* ── Forme de la réponse de /api/enseignant/suivi-stats ───────────────────── */

interface Completion { faits: number; total: number; pct: number | null }

interface BlocResume {
  id: string; type: string; titre: string; statut: string; date: string; matiere: string;
  pctPremier: number | null; pctFinal: number | null; tentatives: number;
  dureeSecondes: number | null; nbQuestions: number | null; bacle: boolean;
}

interface Stats {
  periode: { cle: string; debut: string; fin: string; label: string };
  aujourdhui: string;
  niveaux: string[];
  eleves: Array<{ uid: string; prenom: string; nom: string; niveau: string }>;
  completion: {
    global: Completion; precedente: Completion; jour: Completion; semaine: Completion;
    retards: number;
    parNiveau: Array<{ niveau: string } & Completion>;
    parJour: Array<{ date: string; aVenir: boolean } & Completion>;
    parEleve: LigneEleve[];
  };
  reussite: { periode: number | null; precedente: number | null };
  matieres: LigneMatiere[];
  evolution: LigneSemaine[];
  aSurveiller: EleveAlerte[];
  programmation: Part[];
  programmationTypes: Part[];
  questionsRatees: QuestionRatee[];
  detailEleve: null | {
    eleve: { uid: string; prenom: string; nom: string; niveau: string } | null;
    blocsJour: BlocResume[];
    blocsPeriode: BlocResume[];
  };
}

const PERIODES = [
  { cle: "jour", label: "Aujourd'hui" },
  { cle: "semaine", label: "Cette semaine" },
  { cle: "mois", label: "30 jours" },
  { cle: "trimestre", label: "Trimestre" },
] as const;

/* ────────────────────────────────────────────────────────────────────────── */

export default function PageSuivi() {
  return (
    <Suspense fallback={<Squelette />}>
      <Suivi />
    </Suspense>
  );
}

function Suivi() {
  const router = useRouter();
  const params = useSearchParams();

  const [periode, setPeriode] = useState<string>("semaine");
  const [niveau, setNiveau] = useState<string>("tous");
  const [eleve, setEleve] = useState<string | null>(params.get("eleve"));
  const [stats, setStats] = useState<Stats | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const q = new URLSearchParams({ periode, niveau });
      if (eleve) q.set("eleve", eleve);
      const res = await fetch(`/api/enseignant/suivi-stats?${q}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.erreur ?? "Chargement impossible");
      setStats(json as Stats);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setChargement(false);
    }
  }, [periode, niveau, eleve]);

  useEffect(() => { charger(); }, [charger]);

  // L'élève sélectionné vit dans l'URL : le lien reste partageable et le
  // retour arrière du navigateur fait ce qu'on attend de lui.
  function choisirEleve(uid: string | null) {
    setEleve(uid);
    router.replace(uid ? `/enseignant/suivi?eleve=${uid}` : "/enseignant/suivi", { scroll: false });
  }

  if (chargement && !stats) return <Squelette />;
  if (erreur) {
    return (
      <div className="card" style={{ padding: 40, textAlign: "center" }}>
        <p style={{ color: "var(--error)", fontWeight: 700, marginBottom: 6 }}>Suivi indisponible</p>
        <p style={{ color: ENCRE_DOUCE, fontSize: 13 }}>{erreur}</p>
        <button className="btn-ghost" style={{ marginTop: 14 }} onClick={charger}>Réessayer</button>
      </div>
    );
  }
  if (!stats) return null;

  const c = stats.completion;
  const eleveSel = stats.detailEleve?.eleve ?? null;
  const deltaCompletion =
    c.global.pct !== null && c.precedente.pct !== null ? c.global.pct - c.precedente.pct : null;
  const deltaReussite =
    stats.reussite.periode !== null && stats.reussite.precedente !== null
      ? stats.reussite.periode - stats.reussite.precedente
      : null;
  const serieCompletion = stats.evolution.map((e) => e.completionPct);
  const serieReussite = stats.evolution.map((e) => e.reussitePct);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, opacity: chargement ? 0.6 : 1, transition: "opacity .15s" }}>

      {/* ── Titre et filtres ── */}
      <header style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 className="ens-page-title" style={{ margin: 0 }}>
            {eleveSel ? `${eleveSel.prenom} ${eleveSel.nom}` : "Suivi de la classe"}
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: ENCRE_DOUCE }}>
            {stats.periode.label}
            {eleveSel && ` · ${eleveSel.niveau}`}
          </p>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={eleve ?? ""}
            onChange={(e) => choisirEleve(e.target.value || null)}
            className="form-input"
            style={{ padding: "7px 10px", fontSize: 13, width: "auto", marginBottom: 0 }}
          >
            <option value="">Toute la classe</option>
            {stats.eleves.map((e) => (
              <option key={e.uid} value={e.uid}>{e.prenom} {e.nom} — {e.niveau}</option>
            ))}
          </select>

          {!eleve && (
            <select
              value={niveau}
              onChange={(e) => setNiveau(e.target.value)}
              className="form-input"
              style={{ padding: "7px 10px", fontSize: 13, width: "auto", marginBottom: 0 }}
            >
              <option value="tous">Tous les niveaux</option>
              {stats.niveaux.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          )}

          <div style={{ display: "flex", gap: 4, background: "var(--pb-surface-container)", padding: 3, borderRadius: 999 }}>
            {PERIODES.map((p) => (
              <button
                key={p.cle}
                onClick={() => setPeriode(p.cle)}
                style={{
                  padding: "5px 12px", fontSize: 12, borderRadius: 999, border: "none", cursor: "pointer",
                  fontWeight: periode === p.cle ? 700 : 500,
                  background: periode === p.cle ? "var(--pb-surface-lowest)" : "transparent",
                  color: periode === p.cle ? ENCRE : ENCRE_DOUCE,
                  fontFamily: "inherit",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Bandeau KPI ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
        <KpiTuile
          libelle="Aujourd'hui"
          valeur={c.jour.pct}
          detail={c.jour.total > 0 ? `${c.jour.faits} / ${c.jour.total} travaux` : "Rien de donné"}
        />
        <KpiTuile
          libelle="Cette semaine"
          valeur={c.semaine.pct}
          detail={c.semaine.total > 0 ? `${c.semaine.faits} / ${c.semaine.total} travaux` : "Rien de donné"}
          serie={serieCompletion}
        />
        <KpiTuile
          libelle="Réussite au 1er essai"
          valeur={stats.reussite.periode}
          detail="sur la période"
          delta={deltaReussite}
          serie={serieReussite}
        />
        <KpiTuile
          libelle="En retard"
          valeur={c.retards}
          unite=""
          detail="travaux non rendus"
          sensBon="bas"
        />
        <KpiTuile
          libelle="Complétion période"
          valeur={c.global.pct}
          detail={`${c.global.faits} / ${c.global.total} travaux`}
          delta={deltaCompletion}
        />
      </div>

      {/* ── Vue classe ── */}
      {!eleve && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 18 }}>
            <Carte titre="Complétion par niveau" sousTitre="Part du travail donné qui a été fait">
              {c.parNiveau.length > 0
                ? <GrapheNiveaux donnees={c.parNiveau} />
                : <EtatVide message="Aucun niveau à afficher." />}
            </Carte>

            <Carte
              titre="Complétion jour par jour"
              sousTitre="Sans piste : aucun travail donné · en gris : pas encore dû"
            >
              {c.parJour.length > 0
                ? <GrapheParJour donnees={c.parJour} />
                : <EtatVide message="Aucune journée sur cette période." />}
            </Carte>
          </div>

          <Carte
            titre="Complétion par élève"
            sousTitre="Les plus en retard en haut — cliquez sur une barre pour ouvrir la fiche"
          >
            <GrapheCompletionEleves
              donnees={c.parEleve}
              cle="periode"
              onSelection={choisirEleve}
            />
          </Carte>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 18 }}>
            <Carte
              titre="Réussite par matière"
              sousTitre="Le score du premier essai est celui qui dit si la leçon est passée"
            >
              <GrapheMatieres donnees={stats.matieres} />
            </Carte>

            <Carte titre="Évolution sur 8 semaines" sousTitre="Complétion et réussite, semaine par semaine">
              <GrapheEvolution donnees={stats.evolution} />
            </Carte>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 18 }}>
            <Carte titre="Élèves à surveiller" sousTitre="Classés par cumul de signaux, avec leur motif">
              <ElevesASurveiller eleves={stats.aSurveiller} onSelection={choisirEleve} />
            </Carte>

            <Carte
              titre="Questions les plus ratées"
              sousTitre="Ratées par au moins deux élèves — à reprendre au tableau"
            >
              <QuestionsRatees questions={stats.questionsRatees} />
            </Carte>
          </div>

          <Carte titre="Lecture d'ensemble" sousTitre="Tendances dégagées des pourcentages par sous-domaine">
            <AnalyseIA domaines={domainesIA(stats.matieres)} contexte="d'une classe de CE2-CM1-CM2" />
          </Carte>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 18 }}>
            <Carte
              titre="Équilibre de ma programmation"
              sousTitre="Ce que j'ai donné sur la période, chaque travail compté une fois"
            >
              <GrapheProgrammation matieres={stats.programmation} types={stats.programmationTypes} />
            </Carte>

            <CarteCeintures />
          </div>

          <Repliable titre="Détail du jour" sousTitre="Qui a fait quoi, et ce qu'ils ont répondu">
            <MatriceJour />
          </Repliable>

          <Repliable titre="Progression par chapitre" sousTitre="Où en est chacun dans le programme">
            <ProgressionChapitres />
          </Repliable>
        </>
      )}

      {/* ── Vue élève ── */}
      {eleve && stats.detailEleve && (
        <VueEleve
          detail={stats.detailEleve}
          matieres={stats.matieres}
          evolution={stats.evolution}
          uid={eleve}
          onRetour={() => choisirEleve(null)}
          onChangement={charger}
        />
      )}
    </div>
  );
}

/** Le score du premier essai, seul, alimente l'analyse : c'est la note honnête. */
function domainesIA(matieres: LigneMatiere[]) {
  return matieres.map((m) => ({ libelle: m.sousDomaine, pourcentage: m.pctPremier }));
}

/* ── Vue élève ────────────────────────────────────────────────────────────── */

function VueEleve({
  detail, matieres, evolution, uid, onRetour, onChangement,
}: {
  detail: NonNullable<Stats["detailEleve"]>;
  matieres: LigneMatiere[];
  evolution: LigneSemaine[];
  uid: string;
  onRetour: () => void;
  onChangement: () => void;
}) {
  return (
    <>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn-ghost" style={{ padding: "7px 14px", fontSize: 13 }} onClick={onRetour}>
          ← Toute la classe
        </button>
        <Link
          href={`/enseignant/eleves/${uid}/exercices`}
          className="btn-ghost"
          style={{ padding: "7px 14px", fontSize: 13, textDecoration: "none" }}
        >
          Voir ses exercices de chapitre
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 18 }}>
        <Carte titre="Réussite par matière" sousTitre="Premier essai contre score après correction">
          <GrapheMatieres donnees={matieres} />
        </Carte>

        <Carte titre="Évolution sur 8 semaines" sousTitre="Complétion et réussite de cet élève">
          <GrapheEvolution donnees={evolution} />
        </Carte>
      </div>

      <Carte titre="Lecture d'ensemble" sousTitre="Tendances dégagées des pourcentages par sous-domaine">
        <AnalyseIA
          domaines={domainesIA(matieres)}
          contexte={`de l'élève ${detail.eleve?.prenom ?? ""} (${detail.eleve?.niveau ?? "cycle 3"})`}
        />
      </Carte>

      <Carte titre="Travail du jour" sousTitre="Ce qui est au programme aujourd'hui">
        <ListeBlocs blocs={detail.blocsJour} onChangement={onChangement} />
      </Carte>

      <Repliable titre="Tout le travail de la période" sousTitre={`${detail.blocsPeriode.length} travaux`}>
        <ListeBlocs blocs={detail.blocsPeriode} onChangement={onChangement} />
      </Repliable>
    </>
  );
}

function ListeBlocs({ blocs, onChangement }: { blocs: BlocResume[]; onChangement: () => void }) {
  const [enCours, setEnCours] = useState<string | null>(null);
  const [aValider, setAValider] = useState<BlocResume | null>(null);

  async function refaire(b: BlocResume) {
    if (!confirm(`Remettre « ${b.titre} » à refaire ?`)) return;
    setEnCours(b.id);
    try {
      await fetch("/api/enseignant/bloc-refaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: b.id }),
      });
      onChangement();
    } finally {
      setEnCours(null);
    }
  }

  if (blocs.length === 0) return <EtatVide message="Aucun travail sur cette période." />;

  return (
    <>
    {aValider && (
      <FenetreValidation
        bloc={aValider}
        onFerme={() => setAValider(null)}
        onValide={() => { setAValider(null); onChangement(); }}
      />
    )}
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      {blocs.map((b) => {
        const rythme = b.dureeSecondes && b.nbQuestions
          ? Math.round((b.dureeSecondes / b.nbQuestions) * 10) / 10
          : null;
        return (
          <li
            key={b.id}
            style={{
              display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
              border: "1px solid var(--pb-outline-variant)", borderRadius: 14, padding: "10px 12px",
            }}
          >
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: ENCRE }}>{b.titre}</span>
              <span style={{ display: "block", fontSize: 11, color: ENCRE_DOUCE, marginTop: 2 }}>
                {b.matiere} · {new Date(b.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                {rythme !== null && ` · ${rythme} s / question`}
              </span>
            </span>

            {b.bacle && (
              <span
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700,
                  color: ETAT.serieux,
                }}
              >
                <span className="ms" style={{ fontSize: 15 }} aria-hidden>bolt</span>
                Expédié
              </span>
            )}

            <span style={{ fontSize: 13, fontWeight: 700, color: couleurScore(b.pctPremier), minWidth: 54, textAlign: "right" }}>
              {b.statut === "fait" ? pct(b.pctPremier) : b.statut === "en_cours" ? "En cours" : "À faire"}
            </span>

            {b.statut === "fait" ? (
              <button
                className="btn-ghost"
                style={{ padding: "5px 10px", fontSize: 12 }}
                disabled={enCours === b.id}
                onClick={() => refaire(b)}
              >
                {enCours === b.id ? "…" : "Refaire"}
              </button>
            ) : (
              <button
                className="btn-ghost"
                style={{ padding: "5px 10px", fontSize: 12 }}
                onClick={() => setAValider(b)}
                title="Clore ce travail en gardant ce que l'élève a fait"
              >
                Valider
              </button>
            )}
          </li>
        );
      })}
    </ul>
    </>
  );
}

/* ── Clore un travail qu'un élève ne peut pas terminer ─────────────────────── */

interface Progres { bon: number; total: number; source: "bloc" | "reprise" }

/**
 * Un exercice peut être **infaisable** : un groupe mal placé, une réponse
 * attendue fautive. L'élève a fait neuf questions sur dix et bute sur la
 * dernière. On clôt le travail sans le pénaliser : sa note est rapportée à ce
 * qu'il a fait — 9/9, pas 9/10.
 *
 * Les deux nombres sont **affichés et modifiables** : ils deviennent une note,
 * et l'enseignant sait parfois mieux que la machine ce qui s'est passé.
 */
function FenetreValidation({
  bloc, onFerme, onValide,
}: { bloc: BlocResume; onFerme: () => void; onValide: () => void }) {
  const [progres, setProgres] = useState<Progres | null | undefined>(undefined);
  const [bon, setBon] = useState("");
  const [total, setTotal] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    fetch(`/api/enseignant/bloc-valider?id=${encodeURIComponent(bloc.id)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!vivant) return;
        const p = (d?.progres ?? null) as Progres | null;
        setProgres(p);
        if (p) { setBon(String(p.bon)); setTotal(String(p.total)); }
      })
      .catch(() => { if (vivant) setProgres(null); });
    return () => { vivant = false; };
  }, [bloc.id]);

  async function valider() {
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await fetch("/api/enseignant/bloc-valider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: bloc.id, bon: Number(bon), total: Number(total) }),
      });
      const d = await r.json();
      if (!r.ok) { setErreur(d?.erreur ?? "L'enregistrement a échoué."); return; }
      onValide();
    } catch {
      setErreur("L'enregistrement a échoué.");
    } finally {
      setEnvoi(false);
    }
  }

  const nb = Number(bon), nt = Number(total);
  const valide = Number.isInteger(nb) && Number.isInteger(nt) && nt > 0 && nb >= 0 && nb <= nt;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Valider ${bloc.titre}`}
      onClick={onFerme}
      style={{
        position: "fixed", inset: 0, zIndex: 60, background: "rgba(15,18,32,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--pb-surface-lowest)", borderRadius: 20, padding: "20px 22px",
          width: "min(420px, 100%)", boxShadow: "0 18px 50px rgba(15,18,32,0.25)",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: ENCRE, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          Valider ce travail
        </h3>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: ENCRE, fontWeight: 600 }}>{bloc.titre}</p>
        <p style={{ margin: "10px 0 0", fontSize: 12, color: ENCRE_DOUCE, lineHeight: 1.5 }}>
          Le travail sera marqué comme fait. La note est rapportée à ce que l&apos;élève a
          réellement fait : neuf réponses justes sur neuf données valent 9/9, et non 9/10 —
          une question qu&apos;il n&apos;a pas pu faire ne doit pas compter contre lui.
        </p>

        <p style={{ margin: "12px 0 0", fontSize: 12, color: ENCRE_DOUCE }}>
          {progres === undefined
            ? "Lecture du travail en cours…"
            : progres
              ? `${progres.bon} juste${progres.bon > 1 ? "s" : ""} sur ${progres.total} réponse${progres.total > 1 ? "s" : ""} donnée${progres.total > 1 ? "s" : ""}${progres.source === "reprise" ? ", d'après le travail enregistré." : ", d'après la note déjà portée."}`
              : "Rien d'exploitable n'a été enregistré : saisissez la note vous-même."}
        </p>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginTop: 14 }}>
          <label style={{ fontSize: 11, color: ENCRE_DOUCE, fontWeight: 600 }}>
            Réussies
            <input
              type="number" min={0} inputMode="numeric" value={bon}
              onChange={(e) => setBon(e.target.value)}
              className="form-input"
              style={{ marginTop: 4, marginBottom: 0, width: 88, padding: "7px 10px", fontSize: 14 }}
            />
          </label>
          <span style={{ fontSize: 16, color: ENCRE_DOUCE, paddingBottom: 8 }}>/</span>
          <label style={{ fontSize: 11, color: ENCRE_DOUCE, fontWeight: 600 }}>
            Faites
            <input
              type="number" min={1} inputMode="numeric" value={total}
              onChange={(e) => setTotal(e.target.value)}
              className="form-input"
              style={{ marginTop: 4, marginBottom: 0, width: 88, padding: "7px 10px", fontSize: 14 }}
            />
          </label>
          <span style={{ fontSize: 12, color: ENCRE_DOUCE, paddingBottom: 9 }}>
            {valide ? pct(Math.round((nb / nt) * 100)) : "—"}
          </span>
        </div>

        {erreur && (
          <p style={{ margin: "10px 0 0", fontSize: 12, color: ETAT.critique }}>{erreur}</p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button className="btn-ghost" style={{ padding: "7px 14px", fontSize: 13 }} onClick={onFerme}>
            Annuler
          </button>
          <button
            className="btn-primary"
            style={{ padding: "7px 14px", fontSize: 13 }}
            disabled={!valide || envoi}
            onClick={valider}
          >
            {envoi ? "…" : "Valider"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Ceintures de multiplications ─────────────────────────────────────────── */

function CarteCeintures() {
  const [repartition, setRepartition] = useState<PartCeinture[] | null>(null);

  useEffect(() => {
    let vivant = true;
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (!user || !vivant) return;
      fetch(`/api/ceinture-stats?enseignant_id=${user.id}`)
        .then((r) => r.json())
        .then((d) => { if (vivant) setRepartition(d.repartition ?? []); })
        .catch(() => { if (vivant) setRepartition([]); });
    });
    return () => { vivant = false; };
  }, []);

  return (
    <Carte titre="Ceintures de multiplications" sousTitre="Répartition de la classe">
      {repartition === null
        ? <div className="skeleton" style={{ height: 130, borderRadius: 12 }} />
        : <RepartitionCeintures repartition={repartition} />}
    </Carte>
  );
}

/* ── Squelette ────────────────────────────────────────────────────────────── */

function Squelette() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="skeleton" style={{ height: 44, borderRadius: 12, maxWidth: 380 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton" style={{ height: 108, borderRadius: 20 }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 18 }}>
        {[1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 240, borderRadius: 20 }} />)}
      </div>
    </div>
  );
}
