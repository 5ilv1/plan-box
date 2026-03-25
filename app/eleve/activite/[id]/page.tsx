"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { useEleveSession } from "@/hooks/useEleveSession";
import { PlanTravail, ExerciceIA, CalcMentalIA, RessourceIA, DicteeContenu, MotsContenu, QuestionExercice, StatutBloc } from "@/types";
import CalcMentalStack from "@/components/CalcMentalStack";
import ExerciceStack from "@/components/ExerciceStack";
import DicteePlayer from "@/components/DicteePlayer";
import MotsPlayer from "@/components/MotsPlayer";
import QCMPlayer from "@/components/QCMPlayer";
import AtelierEcriture from "@/components/AtelierEcriture";
import TexteATrousEleve from "@/components/TexteATrousEleve";
import AnalysePhraseEleve from "@/components/AnalysePhraseEleve";
import ClassementEleve from "@/components/ClassementEleve";
import { FonctionGram } from "@/types";
import dynamic from "next/dynamic";
const PdfViewer = dynamic(() => import("@/components/PdfViewer"), { ssr: false });

type EtatActivite = "chargement" | "en_cours" | "termine" | "erreur";

const SEUIL_REUSSITE = 90;

interface ReponseQuestion {
  id: number;
  reponse: string;
  correcte: boolean | null;
}

// ── Helpers type → badge ─────────────────────────────────────────────────────

function typeBadgeConfig(type: string, ressource?: RessourceIA | null) {
  if (type === "eval")           return { label: "Évaluation", tagClass: "tertiary", icon: "star", subtitle: "Montre ce que tu as appris" };
  if (type === "exercice")       return { label: "Exercice", tagClass: "primary", icon: "edit_note", subtitle: "Lis bien les consignes et réponds aux questions" };
  if (type === "calcul_mental")  return { label: "Calcul mental", tagClass: "primary", icon: "calculate", subtitle: "Calcule de tête le plus vite possible" };
  if (type === "dictee")         return { label: "Dictée", tagClass: "secondary", icon: "headphones", subtitle: "Écoute bien attentivement et écris ce que tu entends dans ton cahier" };
  if (type === "mots")           return { label: "Vocabulaire", tagClass: "secondary", icon: "spellcheck", subtitle: "Apprends et retiens les mots importants" };
  if (type === "fichier_maths")  return { label: "Fichier de maths", tagClass: "primary", icon: "menu_book", subtitle: "Ouvre ton fichier et fais les exercices demandés" };
  if (type === "lecon_copier")   return { label: "Leçon à copier", tagClass: "secondary", icon: "book_2", subtitle: "Copie la leçon soigneusement dans ton cahier" };
  if (type === "ecriture")       return { label: "Écriture créative", tagClass: "secondary", icon: "edit_note", subtitle: "Laisse parler ton imagination" };
  if (type === "texte_a_trous") return { label: "Texte à trous", tagClass: "primary", icon: "text_fields", subtitle: "Complète les mots manquants dans le texte" };
  if (type === "analyse_phrase") return { label: "Analyse de phrase", tagClass: "secondary", icon: "schema", subtitle: "Identifie les fonctions des groupes de mots" };
  if (type === "classement") return { label: "Classement", tagClass: "primary", icon: "category", subtitle: "Classe les éléments dans les bonnes catégories" };
  if (type === "ressource") {
    const st = ressource?.sous_type ?? (ressource?.taches?.[0]?.sous_type);
    if (st === "video")              return { label: "Vidéo", tagClass: "secondary", icon: "play_circle", subtitle: "Regarde attentivement la vidéo" };
    if (st === "podcast")            return { label: "Podcast", tagClass: "secondary", icon: "podcasts", subtitle: "Écoute attentivement le podcast" };
    if (st === "exercice_en_ligne")  return { label: "Exercice en ligne", tagClass: "primary", icon: "open_in_new", subtitle: "Fais l\u2019exercice en ligne" };
  }
  return { label: "Ressource", tagClass: "primary", icon: "description", subtitle: "Consulte cette ressource" };
}

// ── Page principale ──────────────────────────────────────────────────────────

export default function PageActivite() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();

  const { session, chargement: chargementSession } = useEleveSession();

  const [bloc, setBloc] = useState<PlanTravail | null>(null);
  const [etat, setEtat] = useState<EtatActivite>("chargement");
  const [erreur, setErreur] = useState("");

  // Leçon à copier : URL Supabase publique, PDF.js s'en charge directement

  const [reponses, setReponses] = useState<ReponseQuestion[]>([]);
  const [soumis, setSoumis] = useState(false);
  const [scoreExercice, setScoreExercice] = useState<{ bon: number; total: number } | null>(null);
  const [scoreCalcul, setScoreCalcul] = useState<{ bon: number; total: number } | null>(null);
  const [evalMessage, setEvalMessage] = useState<string | null>(null);

  const premiereInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (chargementSession) return;
    if (!session) { router.push("/eleve"); return; }
    if (session.source === "repetibox") {
      chargerRB(parseInt(session.id, 10));
    } else {
      chargerPB(session.id);
    }
  }, [chargementSession, session, id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function chargerPB(eleveId: string) {
    const { data, error } = await supabase
      .from("plan_travail")
      .select("*, chapitres(titre, matiere, seuil_reussite)")
      .eq("id", id)
      .eq("eleve_id", eleveId)
      .single();

    if (error || !data) {
      setErreur("Activité introuvable ou accès refusé.");
      setEtat("erreur");
      return;
    }
    initialiserBloc(data as PlanTravail);
  }

  async function chargerRB(rbId: number) {
    const res = await fetch(`/api/mon-plan-travail?rb=${rbId}&bloc=${id}`);
    const json = await res.json();
    if (!res.ok || !json.bloc) {
      setErreur("Activité introuvable ou accès refusé.");
      setEtat("erreur");
      return;
    }
    initialiserBloc(json.bloc as PlanTravail);
  }

  function initialiserBloc(data: PlanTravail) {
    setBloc(data);
    if ((data.type === "exercice" || data.type === "eval") && data.contenu) {
      const exercice = data.contenu as unknown as ExerciceIA;
      setReponses(
        exercice.questions.map((q: QuestionExercice) => ({ id: q.id, reponse: "", correcte: null }))
      );
    }
    setEtat("en_cours");
  }

  useEffect(() => {
    if (etat === "en_cours" && (bloc?.type === "exercice" || bloc?.type === "eval")) {
      setTimeout(() => premiereInputRef.current?.focus(), 100);
    }
  }, [etat, bloc?.type]);

  // ── Mise à jour en temps quasi-réel pour les blocs écriture ──────────────
  // L'enseignant peut modifier le sujet/contrainte pendant que l'élève est sur la page.
  // Polling toutes les 20s — uniquement pour type "ecriture".
  useEffect(() => {
    if (etat !== "en_cours" || bloc?.type !== "ecriture" || !session) return;

    const interval = setInterval(async () => {
      try {
        let contenuFrais: Record<string, unknown> | null = null;

        if (session.source === "repetibox") {
          const res = await fetch(`/api/mon-plan-travail?rb=${session.id}&bloc=${id}`);
          const json = await res.json();
          if (json.bloc?.contenu) contenuFrais = json.bloc.contenu as Record<string, unknown>;
        } else {
          const { data } = await supabase
            .from("plan_travail")
            .select("contenu")
            .eq("id", id)
            .single();
          if (data?.contenu) contenuFrais = data.contenu as Record<string, unknown>;
        }

        if (!contenuFrais) return;

        setBloc(prev => {
          if (!prev) return prev;
          const ancien = prev.contenu as Record<string, unknown>;
          const change =
            contenuFrais!.sujet !== ancien.sujet ||
            contenuFrais!.contrainte !== ancien.contrainte ||
            contenuFrais!.afficher_contrainte !== ancien.afficher_contrainte;
          return change ? { ...prev, contenu: contenuFrais as PlanTravail["contenu"] } : prev;
        });
      } catch { /* silencieux */ }
    }, 20_000);

    return () => clearInterval(interval);
  }, [etat, bloc?.type, session, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── URL PDF pour leçon à copier (PDF.js le charge directement) ──────────────
  const leconUrl = bloc?.type === "lecon_copier" ? (bloc.contenu as any)?.url as string : null;

  async function marquerFait(score?: { bon: number; total: number }, statut: StatutBloc = "fait", reponsesEleve?: { id: number; reponse: string; correcte: boolean | null }[]) {
    if (!bloc) return;
    let contenuMaj = bloc.contenu;
    if (score) {
      contenuMaj = { ...contenuMaj, score_eleve: score.bon, score_total: score.total };
    }
    if (reponsesEleve) {
      contenuMaj = { ...contenuMaj, reponses_eleve: reponsesEleve }  as typeof contenuMaj;
    }

    if (session?.source === "repetibox") {
      await fetch("/api/mon-plan-travail", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocId: bloc.id, statut, eleveRbId: parseInt(session.id, 10), contenu: contenuMaj }),
      });
    } else {
      await supabase.from("plan_travail").update({ statut, contenu: contenuMaj }).eq("id", bloc.id);
    }
  }

  async function verifierProgression(): Promise<{ evalDeclenche: boolean; message: string }> {
    if (!bloc?.chapitre_id) return { evalDeclenche: false, message: "" };
    const body: Record<string, unknown> = { chapitreId: bloc.chapitre_id, source: session!.source };
    if (session!.source === "planbox") body.eleveId = session!.id;
    else body.eleveRbId = parseInt(session!.id, 10);
    try {
      const res = await fetch("/api/progression/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return await res.json();
    } catch {
      return { evalDeclenche: false, message: "" };
    }
  }

  async function validerProgressionChapitre(scoreEleve: number, scoreTotal: number, questionsRatees?: { recto: string; verso: string }[]) {
    if (!bloc?.chapitre_id || session?.source !== "planbox") return;
    await fetch("/api/progression/valider-eval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eleveId: session.id,
        chapitreId: bloc.chapitre_id,
        scoreEleve,
        scoreTotal,
        planTravailId: bloc.id,
        questionsRatees,
      }),
    }).catch(() => null);
  }

  function recommencer() {
    if (!bloc?.contenu) return;
    const exercice = bloc.contenu as unknown as ExerciceIA;
    setReponses(exercice.questions.map((q: QuestionExercice) => ({ id: q.id, reponse: "", correcte: null })));
    setSoumis(false);
    setScoreExercice(null);
    setEvalMessage(null);
    setEtat("en_cours");
  }

  async function soumettrExercice() {
    if (!bloc?.contenu) return;
    const exercice = bloc.contenu as unknown as ExerciceIA;

    const reponsesVerifiees: ReponseQuestion[] = reponses.map((r) => {
      const question = exercice.questions.find((q) => q.id === r.id);
      const attendue = question?.reponse_attendue?.trim().toLowerCase() ?? "";
      const saisie = r.reponse.trim().toLowerCase();
      return { ...r, correcte: saisie !== "" && saisie === attendue };
    });

    const bon = reponsesVerifiees.filter((r) => r.correcte).length;
    const total = reponsesVerifiees.length;
    const pct = Math.round((bon / total) * 100);
    const statut: StatutBloc = pct >= SEUIL_REUSSITE ? "fait" : "en_cours";

    setReponses(reponsesVerifiees);
    setSoumis(true);
    setScoreExercice({ bon, total });

    await marquerFait({ bon, total }, statut, reponsesVerifiees.map(r => ({ id: r.id, reponse: r.reponse, correcte: r.correcte })));

    if (bloc.type === "eval") {
      const questionsRatees = reponsesVerifiees
        .filter((r) => !r.correcte)
        .map((r) => {
          const q = exercice.questions.find((q) => q.id === r.id);
          return { recto: q?.enonce ?? "", verso: q?.reponse_attendue ?? "" };
        })
        .filter((c) => c.recto && c.verso);
      await validerProgressionChapitre(bon, total, questionsRatees);
      if (statut === "fait") {
        setEvalMessage("🏆 Chapitre validé ! Félicitations !");
      } else {
        setEvalMessage("📚 Score insuffisant. Révise sur Repetibox — tu pourras réessayer demain !");
      }
    } else if (statut === "fait" && bloc.chapitre_id) {
      const { evalDeclenche, message } = await verifierProgression();
      if (evalDeclenche) setEvalMessage(message);
    }

    setEtat("termine");
  }

  async function onCalcMentalComplete(bon: number, total: number, repEleve?: { id: number; reponse: string; correcte: boolean | null }[]) {
    const pct = Math.round((bon / total) * 100);
    const statut: StatutBloc = pct >= SEUIL_REUSSITE ? "fait" : "en_cours";
    setScoreCalcul({ bon, total });
    await marquerFait({ bon, total }, statut, repEleve);
    if (statut === "fait" && bloc?.chapitre_id) {
      const { evalDeclenche, message } = await verifierProgression();
      if (evalDeclenche) setEvalMessage(message);
    }
    setEtat("termine");
  }

  // ── Chargement ──────────────────────────────────────────────────────────────
  if (etat === "chargement") {
    return (
      <div className="eleve-page" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "var(--pb-on-surface-variant)" }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            border: "3px solid var(--pb-surface-container)",
            borderTopColor: "var(--pb-primary)",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto 16px",
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Chargement…</p>
        </div>
      </div>
    );
  }

  // ── Erreur ───────────────────────────────────────────────────────────────────
  if (etat === "erreur" || !bloc) {
    return (
      <div className="eleve-page" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div className="pb-card" style={{ maxWidth: 420, textAlign: "center", padding: "40px 32px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>😕</div>
          <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 24, color: "var(--pb-on-surface)" }}>
            {erreur || "Une erreur est survenue."}
          </p>
          <Link href="/eleve/dashboard" className="pb-btn primary">
            ← Retour au tableau de bord
          </Link>
        </div>
      </div>
    );
  }

  const exercice  = (bloc.type === "exercice" || bloc.type === "eval") ? (bloc.contenu as unknown as ExerciceIA) : null;
  const calcMental = bloc.type === "calcul_mental" ? (bloc.contenu as unknown as CalcMentalIA) : null;
  const texteATrous = bloc.type === "texte_a_trous" ? (bloc.contenu as unknown as { titre: string; consigne: string; texte_complet: string; trous: { position: number; mot: string; indice?: string }[] }) : null;
  const analysePhrase = bloc.type === "analyse_phrase" ? (bloc.contenu as unknown as { titre: string; consigne: string; phrases: { texte: string; groupes: { mots: string; fonction: FonctionGram; debut: number; fin: number }[] }[]; fonctionsActives: FonctionGram[] }) : null;
  const classementData = bloc.type === "classement" ? (bloc.contenu as unknown as { titre: string; consigne: string; categories: string[]; items: { texte: string; categorie: string }[] }) : null;
  const ressource  = bloc.type === "ressource" ? (bloc.contenu as unknown as RessourceIA) : null;
  const dictee     = bloc.type === "dictee" ? (bloc.contenu as unknown as DicteeContenu) : null;
  const mots       = bloc.type === "mots" ? (bloc.contenu as unknown as MotsContenu) : null;
  const fichierMaths = bloc.type === "fichier_maths"
    ? (bloc.contenu as unknown as { numero_page: number; niveau: string })
    : null;
  const leconCopier = bloc.type === "lecon_copier"
    ? (bloc.contenu as unknown as { url: string })
    : null;
  const ecriture = bloc.type === "ecriture"
    ? (bloc.contenu as unknown as { sujet: string; contrainte: string; instructions: string; afficher_contrainte?: boolean })
    : null;

  const badgeCfg = typeBadgeConfig(bloc.type, ressource);
  const { label: typeLabel, tagClass, icon: typeIcon } = badgeCfg;

  // Sous-titre dynamique pour l'atelier d'écriture semaine
  const typeSubtitle = (() => {
    if (bloc.type === "ecriture" && (bloc.contenu as any)?.mode === "semaine") {
      const day = new Date().getDay();
      if (day === 1) return "J1 — Premier jet : écris ton histoire";
      if (day === 2) return "J2 — Correction : corrige les erreurs identifiées";
      if (day === 4) return "J3 — Amélioration : continue à corriger et développer";
      if (day === 5) return "J4 — Finalisation : termine et rends ton texte";
      return "Atelier d\u2019écriture sur 4 jours";
    }
    return badgeCfg.subtitle;
  })();

  // ── Page terminée ────────────────────────────────────────────────────────────
  if (etat === "termine") {
    const score = scoreExercice ?? scoreCalcul;
    const pct = score ? Math.round((score.bon / score.total) * 100) : null;
    const reussi = pct !== null && pct >= SEUIL_REUSSITE;

    return (
      <div className="eleve-page">
        {/* Nav */}
        <nav className="eleve-nav">
          <div className="eleve-nav-inner">
            <Link href="/eleve/dashboard" className="eleve-nav-logo" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="ms" style={{ fontSize: 20 }}>arrow_back</span>
              Plan Box
            </Link>
            <span className="pb-exo-tag primary">{typeLabel}</span>
            <div />
          </div>
        </nav>

        <main className="eleve-main" style={{ maxWidth: 720, margin: "0 auto", padding: "96px 24px 120px" }}>
          <div className="pb-card" style={{ textAlign: "center", padding: "48px 32px" }}>
            {pct !== null ? (
              <>
                <div style={{ fontSize: 64, marginBottom: 16 }}>
                  {reussi ? (bloc.type === "eval" ? "🏆" : "🎉") : "💪"}
                </div>
                <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 36, fontWeight: 900, letterSpacing: -1, color: reussi ? "var(--pb-primary)" : "var(--pb-tertiary)", marginBottom: 8 }}>
                  {score!.bon} / {score!.total}
                </h2>
                <p style={{ fontSize: 16, color: "var(--pb-on-surface-variant)", marginBottom: 24 }}>
                  {reussi
                    ? (bloc.type === "eval" ? "Excellent ! Chapitre validé !" : "Bravo, exercice réussi !")
                    : `Score insuffisant (${pct}% — seuil : ${SEUIL_REUSSITE}%). Entraîne-toi encore !`}
                </p>

                {evalMessage && (
                  <div style={{
                    background: "rgba(0,80,212,0.06)",
                    border: "1.5px solid rgba(0,80,212,0.15)",
                    borderRadius: "1rem",
                    padding: "14px 18px",
                    marginBottom: 20,
                    fontSize: 14,
                    color: "var(--pb-primary)",
                    fontWeight: 600,
                    textAlign: "left",
                  }}>
                    {evalMessage}
                  </div>
                )}

                {!reussi && (
                  <button
                    className="pb-btn surface"
                    onClick={recommencer}
                    style={{ marginBottom: 16, width: "100%" }}
                  >
                    <span className="ms" style={{ fontSize: 18 }}>refresh</span>
                    Refaire l'exercice
                  </button>
                )}
              </>
            ) : (
              <>
                <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
                <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 26, fontWeight: 800, color: "var(--pb-primary)", marginBottom: 24 }}>
                  Activité terminée !
                </h2>
              </>
            )}

            {/* Corrigé */}
            {soumis && exercice && (
              <div style={{ textAlign: "left", marginBottom: 28 }}>
                <p style={{ fontWeight: 700, marginBottom: 14, fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 15 }}>
                  Corrigé :
                </p>
                {exercice.questions.map((q, i) => {
                  const rep = reponses.find((r) => r.id === q.id);
                  return (
                    <div
                      key={q.id}
                      style={{
                        marginBottom: 10, padding: "12px 16px", borderRadius: "1rem",
                        background: rep?.correcte ? "#dcfce7" : "#fee2e2",
                        borderLeft: `4px solid ${rep?.correcte ? "#22c55e" : "#ef4444"}`,
                      }}
                    >
                      <div style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", marginBottom: 4 }}>
                        Q{i + 1}. {q.enonce}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>
                        {rep?.correcte ? (
                          <span style={{ color: "#166534" }}>✓ {rep.reponse}</span>
                        ) : (
                          <>
                            <span style={{ color: "#dc2626" }}>✗ {rep?.reponse || "(sans réponse)"}</span>
                            <span style={{ color: "var(--pb-on-surface-variant)", marginLeft: 8 }}>
                              → {q.reponse_attendue}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <Link href="/eleve/dashboard" className="pb-btn primary" style={{ width: "100%" }}>
              <span className="ms" style={{ fontSize: 18 }}>home</span>
              Retour au tableau de bord
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // ── Activité en cours ────────────────────────────────────────────────────────
  return (
    <div className="eleve-page">

      {/* Nav */}
      <nav className="eleve-nav">
        <div className="eleve-nav-inner">
          <Link href="/eleve/dashboard" className="eleve-nav-link" style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
            <span className="ms" style={{ fontSize: 18 }}>arrow_back</span>
            Retour
          </Link>
          <span className="pb-exo-tag" style={{ fontSize: 11 }}>{typeLabel}</span>
          <div style={{ width: 60 }} />
        </div>
      </nav>

      <main className="eleve-main" style={{ maxWidth: "none", padding: "88px 16px 120px" }}>

        {/* En-tête activité — style centré */}
        <header style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: "clamp(1.75rem, 5vw, 2.5rem)",
            fontWeight: 800, letterSpacing: -0.5,
            color: "var(--pb-on-surface)", marginBottom: 8,
          }}>
            {bloc.titre}
            <span
              className="ms"
              style={{
                fontSize: "clamp(1.25rem, 4vw, 2rem)", marginLeft: 10,
                verticalAlign: "middle",
                color: tagClass === "secondary"
                  ? "var(--pb-secondary)"
                  : tagClass === "tertiary"
                    ? "var(--pb-tertiary)"
                    : "var(--pb-primary)",
              }}
            >
              {typeIcon}
            </span>
          </h1>
          <p style={{ color: "var(--pb-on-surface-variant)", fontWeight: 500, fontSize: 14, letterSpacing: "0.02em", lineHeight: 1.6 }}>
            {typeSubtitle}
          </p>
          {bloc.chapitres && (
            <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", marginTop: 6, opacity: 0.7 }}>
              {bloc.chapitres.matiere} · {bloc.chapitres.titre}
              {bloc.type === "eval" && (
                <span className="pb-exo-tag tertiary" style={{ marginLeft: 8 }}>Évaluation finale</span>
              )}
            </p>
          )}
        </header>

        {/* Layout 2 colonnes pour dictée uniquement */}
        <div className={dictee ? "eleve-activite" : ""}>

          {/* Contenu principal */}
          <div>

            {/* ── Dictée ── */}
            {dictee && (
              <div className="pb-audio-player">
                <DicteePlayer
                  phrases={dictee.phrases ?? []}
                  audioCompletUrl={dictee.audio_complet_url}
                  audioPhraseUrls={dictee.audio_phrases_urls}
                  onTermine={() => marquerFait().then(() => setEtat("termine"))}
                />
              </div>
            )}

            {/* ── Mots ── */}
            {mots && (
              <div className="pb-card">
                <MotsPlayer
                  mots={mots.mots ?? []}
                  onTermine={(score, total) => {
                    const pct = total > 0 ? (score / total) * 100 : 0;
                    const statut: StatutBloc = pct >= 80 ? "fait" : "en_cours";
                    marquerFait(undefined, statut).then(() => setEtat("termine"));
                  }}
                />
              </div>
            )}

            {/* ── Ressource ── */}
            {ressource && (
              <RessourceEleve
                data={ressource}
                bloc={bloc}
                session={session}
                onFait={() => marquerFait().then(() => setEtat("termine"))}
                onMarquer={() => marquerFait()}
                onMarquerAvecScore={(score, statut, reponses) => marquerFait(score, (statut as "fait" | "en_cours" | "a_faire") ?? "fait", reponses)}
              />
            )}

            {/* ── Calcul mental ── */}
            {calcMental && (
              <div className="pb-card">
                <CalcMentalStack
                  calculs={calcMental.calculs}
                  onComplete={onCalcMentalComplete}
                />
              </div>
            )}

            {/* ── Exercice / Évaluation (cartes stackées) ── */}
            {exercice && !soumis && (
              <ExerciceStack
                consigne={exercice.consigne}
                questions={exercice.questions}
                onComplete={(reponsesStack, scoreStack, totalStack) => {
                  setReponses(reponsesStack);
                  setSoumis(true);
                  const pct = totalStack > 0 ? Math.round((scoreStack / totalStack) * 100) : 0;
                  const statut: StatutBloc = pct >= 80 ? "fait" : "en_cours";
                  marquerFait({ bon: scoreStack, total: totalStack }, statut, reponsesStack);
                }}
              />
            )}
            {exercice && soumis && (
              <div className="pb-card" style={{ textAlign: "center", padding: "32px 24px" }}>
                <span className="ms" style={{ fontSize: 48, color: "#16A34A" }}>check_circle</span>
                <p style={{ fontWeight: 800, fontSize: 20, color: "#16A34A", marginTop: 8, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  Exercice terminé !
                </p>
                <p style={{ fontSize: 14, color: "var(--pb-on-surface-variant)", marginTop: 4 }}>
                  Tes réponses ont été enregistrées.
                </p>
              </div>
            )}

            {/* ── Texte à trous ── */}
            {texteATrous && (etat as string) === "en_cours" && (
              <div className="pb-card" style={{ padding: "1.25rem 1.5rem" }}>
                <TexteATrousEleve
                  titre={texteATrous.titre}
                  consigne={texteATrous.consigne}
                  texteComplet={texteATrous.texte_complet}
                  trous={texteATrous.trous}
                  onTermine={(score, repEleve) => {
                    marquerFait(score, score.bon / score.total >= 0.8 ? "fait" : "en_cours", repEleve);
                  }}
                />
              </div>
            )}
            {texteATrous && (etat as string) === "termine" && (
              <div className="pb-card" style={{ textAlign: "center", padding: "32px 24px" }}>
                <span className="ms" style={{ fontSize: 48, color: "#16A34A" }}>check_circle</span>
                <p style={{ fontWeight: 800, fontSize: 20, color: "#16A34A", marginTop: 8, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  Texte à trous terminé !
                </p>
              </div>
            )}

            {/* ── Analyse de phrase ── */}
            {analysePhrase && (etat as string) === "en_cours" && (
              <div className="pb-card" style={{ padding: "1.25rem 1.5rem" }}>
                <AnalysePhraseEleve
                  titre={analysePhrase.titre}
                  consigne={analysePhrase.consigne}
                  phrases={analysePhrase.phrases}
                  fonctionsActives={analysePhrase.fonctionsActives ?? ["Sujet", "Verbe", "COD", "COI", "CC Lieu", "CC Temps", "CC Manière"]}
                  onTermine={(score, repEleve) => {
                    marquerFait(score, score.bon / score.total >= 0.7 ? "fait" : "en_cours", repEleve);
                  }}
                />
              </div>
            )}
            {analysePhrase && (etat as string) === "termine" && (
              <div className="pb-card" style={{ textAlign: "center", padding: "32px 24px" }}>
                <span className="ms" style={{ fontSize: 48, color: "#16A34A" }}>check_circle</span>
                <p style={{ fontWeight: 800, fontSize: 20, color: "#16A34A", marginTop: 8, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  Analyse terminée !
                </p>
              </div>
            )}

            {/* ── Classement ── */}
            {classementData && (etat as string) === "en_cours" && (
              <div className="pb-card" style={{ padding: "1.25rem 1.5rem" }}>
                <ClassementEleve
                  titre={classementData.titre}
                  consigne={classementData.consigne}
                  categories={classementData.categories}
                  items={classementData.items}
                  onTermine={(score, repEleve) => {
                    marquerFait(score, score.bon / score.total >= 0.8 ? "fait" : "en_cours", repEleve);
                  }}
                />
              </div>
            )}
            {classementData && (etat as string) === "termine" && (
              <div className="pb-card" style={{ textAlign: "center", padding: "32px 24px" }}>
                <span className="ms" style={{ fontSize: 48, color: "#16A34A" }}>check_circle</span>
                <p style={{ fontWeight: 800, fontSize: 20, color: "#16A34A", marginTop: 8, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  Classement terminé !
                </p>
              </div>
            )}

            {/* ── Fichier de maths ── */}
            {fichierMaths && (
              <div className="pb-card" style={{ textAlign: "center", padding: "56px 32px" }}>
                <div style={{ fontSize: 64, marginBottom: 12 }}>📐</div>
                <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 48, fontWeight: 900, color: "var(--pb-primary)", marginBottom: 6 }}>
                  Page {fichierMaths.numero_page}
                </div>
                <div style={{ fontSize: 16, color: "var(--pb-on-surface-variant)", marginBottom: 36 }}>
                  Fichier de maths — {fichierMaths.niveau}
                </div>
                <button
                  className="pb-btn primary"
                  onClick={() => marquerFait().then(() => setEtat("termine"))}
                  style={{ fontSize: 16, padding: "16px 40px" }}
                >
                  <span className="ms" style={{ fontSize: 20 }}>check</span>
                  J&apos;ai fait la page {fichierMaths.numero_page}
                </button>
              </div>
            )}

            {/* ── Leçon à copier ── */}
            {leconCopier && (() => {
              const rawUrl = leconCopier.url ?? "";
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* Header */}
                  <div className="pb-card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#7C2D12", marginBottom: 3 }}>Leçon à copier</div>
                      <div style={{ fontSize: 17, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface)" }}>{bloc.titre}</div>
                    </div>
                    <a
                      href={rawUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "var(--pb-primary)", textDecoration: "none", flexShrink: 0 }}
                    >
                      <span className="ms" style={{ fontSize: 16 }}>open_in_new</span>
                      Ouvrir dans Drive
                    </a>
                  </div>

                  {/* Aperçu PDF — rendu via PDF.js, sans barre d'outils */}
                  {leconUrl && (
                    <div className="pb-card" style={{ padding: 12, overflow: "hidden", borderRadius: 16, border: "1px solid var(--pb-outline-variant)" }}>
                      <PdfViewer url={leconUrl} hauteur={600} />
                    </div>
                  )}

                  {/* Bouton validation */}
                  <button
                    className="pb-btn primary"
                    onClick={() => marquerFait().then(() => setEtat("termine"))}
                    style={{ fontSize: 15, padding: "14px 32px", borderRadius: 14 }}
                  >
                    <span className="ms" style={{ fontSize: 20 }}>check_circle</span>
                    J&apos;ai copié la leçon sur mon cahier
                  </button>
                </div>
              );
            })()}

            {/* ── Écriture créative ── */}
            {/* ── Écriture créative ── */}
            {ecriture && (ecriture as any).mode === "semaine" ? (
              <div className="pb-card" style={{ padding: "24px 20px" }}>
                <AtelierEcriture
                  blocId={bloc.id}
                  sujet={ecriture.sujet}
                  contrainte={ecriture.contrainte}
                  afficherContrainte={ecriture.afficher_contrainte !== false}
                  contenu={bloc.contenu as Record<string, unknown>}
                  eleveRbId={session?.source === "repetibox" ? parseInt(session.id, 10) : undefined}
                  onTermine={() => setEtat("termine")}
                />
              </div>
            ) : ecriture ? (
              <div className="pb-card" style={{ padding: "32px 28px" }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.06em", color: "#7C3AED", marginBottom: 12,
                }}>
                  Écriture créative
                </div>
                <h2 style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 22, fontWeight: 800, color: "var(--pb-on-surface)",
                  marginBottom: 20, lineHeight: 1.35,
                }}>
                  {ecriture.sujet}
                </h2>
                {ecriture.contrainte && ecriture.afficher_contrainte !== false && (
                  <div style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    background: "rgba(124,58,237,0.07)", border: "1.5px solid rgba(124,58,237,0.18)",
                    borderRadius: 12, padding: "14px 16px", marginBottom: 20,
                  }}>
                    <span className="ms" style={{ fontSize: 18, color: "#7C3AED", flexShrink: 0, marginTop: 1 }}>push_pin</span>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "#5B21B6", margin: 0, lineHeight: 1.5 }}>
                      {ecriture.contrainte}
                    </p>
                  </div>
                )}
                {ecriture.instructions && (
                  <p style={{ fontSize: 14, color: "var(--pb-on-surface-variant)", fontStyle: "italic", marginBottom: 28, lineHeight: 1.6 }}>
                    {ecriture.instructions}
                  </p>
                )}
                <button
                  className="pb-btn primary"
                  onClick={() => marquerFait().then(() => setEtat("termine"))}
                  style={{ fontSize: 15, padding: "14px 32px", borderRadius: 14, width: "100%" }}
                >
                  <span className="ms" style={{ fontSize: 20 }}>check_circle</span>
                  J&apos;ai terminé
                </button>
              </div>
            ) : null}

            {/* Fallback */}
            {!exercice && !calcMental && !texteATrous && !analysePhrase && !classementData && !ressource && !fichierMaths && !dictee && !mots && !leconCopier && !ecriture && (
              <div className="pb-card" style={{ textAlign: "center", padding: "48px 32px" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
                <p style={{ color: "var(--pb-on-surface-variant)", marginBottom: 28 }}>
                  Ce type d'activité n'a pas d'interaction numérique.
                </p>
                <button
                  className="pb-btn primary"
                  onClick={() => marquerFait().then(() => setEtat("termine"))}
                >
                  <span className="ms" style={{ fontSize: 20 }}>check</span>
                  Marquer comme fait
                </button>
              </div>
            )}
          </div>

          {/* ── Aside (infos chapitre + conseils) — visible sur desktop si layout 2 col ── */}
          {(dictee || ressource) && (dictee || bloc.chapitres) && (
            <aside style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Conseils de relecture — dictée uniquement */}
              {dictee && (
                <div style={{
                  background: "var(--pb-surface-container)", borderRadius: 24,
                  padding: "24px 24px 20px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 12,
                      background: "rgba(112,42,225,0.12)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <span className="ms" style={{ fontSize: 20, color: "var(--pb-secondary)" }}>lightbulb</span>
                    </div>
                    <h4 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 15, color: "var(--pb-on-surface)", margin: 0 }}>
                      Conseils de relecture
                    </h4>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--pb-on-surface-variant)", margin: 0 }}>
                      Avant de rendre ta dictée, relis attentivement en vérifiant ces points :
                    </p>
                    <div style={{
                      background: "var(--pb-surface-container-lowest, white)", padding: "14px 16px",
                      borderRadius: 12, fontSize: 13, lineHeight: 1.6,
                      display: "flex", flexDirection: "column", gap: 8,
                    }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <span className="ms" style={{ fontSize: 16, color: "var(--pb-primary)", flexShrink: 0, marginTop: 2 }}>check</span>
                        <span style={{ color: "var(--pb-on-surface)" }}>Les <strong>majuscules</strong> en début de phrase et aux noms propres</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <span className="ms" style={{ fontSize: 16, color: "var(--pb-primary)", flexShrink: 0, marginTop: 2 }}>check</span>
                        <span style={{ color: "var(--pb-on-surface)" }}>Les <strong>accords</strong> sujet-verbe et dans le groupe nominal</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <span className="ms" style={{ fontSize: 16, color: "var(--pb-primary)", flexShrink: 0, marginTop: 2 }}>check</span>
                        <span style={{ color: "var(--pb-on-surface)" }}>La <strong>ponctuation</strong> : points, virgules, guillemets</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <span className="ms" style={{ fontSize: 16, color: "var(--pb-primary)", flexShrink: 0, marginTop: 2 }}>check</span>
                        <span style={{ color: "var(--pb-on-surface)" }}>Les <strong>homophones</strong> : a/à, et/est, on/ont, son/sont</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {bloc.chapitres && (
                <div className="pb-aside-card">
                  <p style={{ fontWeight: 800, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--pb-on-surface-variant)", marginBottom: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    Chapitre
                  </p>
                  <p style={{ fontWeight: 700, fontSize: 16, color: "var(--pb-on-surface)", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    {bloc.chapitres.titre}
                  </p>
                  {bloc.chapitres.matiere && (
                    <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", marginTop: 4 }}>
                      {bloc.chapitres.matiere}
                    </p>
                  )}
                </div>
              )}

              <div className="pb-aside-card">
                <p style={{ fontWeight: 800, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--pb-on-surface-variant)", marginBottom: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  Type d&apos;activité
                </p>
                <span className={`pb-exo-tag ${tagClass}`} style={{ fontSize: 12 }}>{typeLabel}</span>
              </div>
            </aside>
          )}

        </div>
      </main>

      {/* Bottom nav mobile */}
      <nav className="pb-bottom-nav">
        <Link href="/eleve/dashboard" className="pb-bottom-nav-item">
          <span className="ms" style={{ fontSize: 22 }}>home</span>
          Accueil
        </Link>
        <span className="pb-bottom-nav-item active">
          <span className="ms" style={{ fontSize: 22 }}>edit_note</span>
          Activité
        </span>
      </nav>

    </div>
  );
}

// ── Helpers ressource ─────────────────────────────────────────────────────────

function getEmbedUrl(url: string): string | null {
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?rel=0`;
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  return null;
}

function isAudioUrl(url: string): boolean {
  return /\.(mp3|ogg|wav|m4a|aac)(\?|$)/i.test(url);
}

interface OgMeta { titre: string; description: string; image: string; siteName: string; }

function useLinkPreview(url?: string) {
  const [meta, setMeta] = useState<OgMeta | null>(null);
  useEffect(() => {
    if (!url) return;
    fetch(`/api/og-preview?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((d) => { if (d.titre || d.image) setMeta(d); })
      .catch(() => null);
  }, [url]);
  return meta;
}

function AudioPlayerCustom({ url, title, sousTpe, onComplete, onPlay }: { url: string; title: string; sousTpe?: string; onComplete?: () => void; onPlay?: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const completedRef = useRef(false);
  const ogMeta = useLinkPreview(sousTpe === "podcast" ? url : undefined);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => {
      setCurrent(a.currentTime);
      // Considérer comme écouté si on atteint 95% ou la fin
      if (!completedRef.current && a.duration > 0 && a.currentTime / a.duration >= 0.95) {
        completedRef.current = true;
        onComplete?.();
      }
    };
    const onMeta = () => setDuration(a.duration);
    const onEnd = () => { setPlaying(false); if (!completedRef.current) { completedRef.current = true; onComplete?.(); } };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    return () => { a.removeEventListener("timeupdate", onTime); a.removeEventListener("loadedmetadata", onMeta); a.removeEventListener("ended", onEnd); };
  }, []);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); } else { a.play(); onPlay?.(); }
    setPlaying(!playing);
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    a.currentTime = pct * duration;
  }

  function skip(seconds: number) {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + seconds));
  }

  function fmt(s: number) {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div style={{
      background: "linear-gradient(135deg, #0050D4 0%, #002266 100%)",
      borderRadius: "1.25rem",
      padding: "1.75rem 2rem",
      display: "flex",
      gap: "1.5rem",
      alignItems: "center",
      boxShadow: "0 8px 32px rgba(0,80,212,0.25)",
      marginLeft: -8,
      marginRight: -8,
    }}>
      <audio ref={audioRef} src={url} preload="metadata" />

      {/* Image ou icône */}
      {ogMeta?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ogMeta.image}
          alt=""
          style={{ width: 80, height: 80, borderRadius: "1rem", objectFit: "cover", flexShrink: 0 }}
        />
      ) : (
        <div style={{
          width: 80, height: 80, borderRadius: "1rem", flexShrink: 0,
          background: "rgba(255,255,255,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span className="ms" style={{ fontSize: 40, color: "rgba(255,255,255,0.9)" }}>
            {sousTpe === "podcast" ? "podcasts" : "headphones"}
          </span>
        </div>
      )}

      {/* Contenu player */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Titre */}
        <div style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 800, fontSize: "1.125rem", color: "white",
          marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {ogMeta?.titre || title}
        </div>
        {ogMeta?.description && (
          <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.6)", marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {ogMeta.description}
          </div>
        )}

        {/* Barre de progression */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.7)", fontWeight: 600, minWidth: 32 }}>{fmt(currentTime)}</span>
          <div
            onClick={seek}
            style={{
              flex: 1, height: 6, background: "rgba(255,255,255,0.2)",
              borderRadius: 999, cursor: "pointer", position: "relative",
            }}
          >
            <div style={{ width: `${pct}%`, height: "100%", background: "white", borderRadius: 999, transition: "width 0.1s" }} />
            <div style={{
              position: "absolute", top: "50%", left: `${pct}%`,
              width: 14, height: 14, borderRadius: "50%",
              background: "white", transform: "translate(-50%, -50%)",
              boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
            }} />
          </div>
          <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.7)", fontWeight: 600, minWidth: 32, textAlign: "right" }}>{fmt(duration)}</span>
        </div>

        {/* Contrôles */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20 }}>
          <button onClick={() => skip(-10)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.8)", display: "flex", alignItems: "center", padding: 4 }}>
            <span className="ms" style={{ fontSize: 28 }}>replay_10</span>
          </button>
          <button onClick={toggle} style={{
            width: 52, height: 52, borderRadius: "50%",
            background: "white", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          }}>
            <span className="ms" style={{ fontSize: 32, color: "#0050D4", fontVariationSettings: "'FILL' 1" }}>
              {playing ? "pause" : "play_arrow"}
            </span>
          </button>
          <button onClick={() => skip(10)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.8)", display: "flex", alignItems: "center", padding: 4 }}>
            <span className="ms" style={{ fontSize: 28 }}>forward_10</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function TacheEleve({
  tache,
  numero,
  total,
  onAudioComplete,
  onAudioPlay,
}: {
  tache: { sous_type?: string; texte?: string; url?: string; reference?: string; label?: string };
  numero?: number;
  total?: number;
  onAudioComplete?: () => void;
  onAudioPlay?: () => void;
}) {
  const embedUrl = tache.url ? getEmbedUrl(tache.url) : null;
  const audio = tache.url ? isAudioUrl(tache.url) : false;
  const isLien = !!tache.url && !embedUrl && !audio && tache.sous_type !== "exercice_en_ligne";
  const ogMeta = useLinkPreview(isLien ? tache.url : undefined);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {numero !== undefined && total !== undefined && total > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 28, height: 28, borderRadius: "50%", background: "var(--pb-primary)",
            color: "white", fontSize: 13, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}>
            {numero}
          </span>
          <span style={{ fontWeight: 700, fontSize: 14, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {tache.label || (
              tache.sous_type === "video" ? "Vidéo" :
              tache.sous_type === "podcast" ? "Podcast" :
              tache.sous_type === "exercice_en_ligne" ? "Exercice en ligne" :
              tache.sous_type === "exercice_papier" ? "Exercice papier" : "Ressource"
            )}
          </span>
        </div>
      )}

      {tache.texte && (
        <div style={{
          padding: "14px 16px",
          background: "var(--pb-surface-low)",
          border: "1.5px solid var(--pb-surface-container)",
          borderRadius: "1rem",
          fontSize: 14,
          lineHeight: 1.6,
          color: "var(--pb-on-surface)",
        }}>
          {tache.texte}
        </div>
      )}

      {tache.reference && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "14px 18px",
          background: "rgba(248,160,16,0.08)",
          border: "1.5px solid rgba(248,160,16,0.3)",
          borderRadius: "1rem",
          fontSize: 14, fontWeight: 600,
        }}>
          <span className="ms" style={{ fontSize: 22, color: "var(--pb-tertiary)" }}>description</span>
          <span style={{ color: "var(--pb-on-surface)" }}>{tache.reference}</span>
        </div>
      )}

      {embedUrl && (
        <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: "1.25rem", overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
          <iframe
            src={embedUrl}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
            title={tache.texte ?? "Vidéo"}
          />
        </div>
      )}

      {audio && tache.url && (
        <AudioPlayerCustom url={tache.url} title={tache.label || tache.texte || "Podcast"} sousTpe={tache.sous_type} onComplete={onAudioComplete} onPlay={onAudioPlay} />
      )}

      {tache.sous_type === "exercice_en_ligne" && tache.url && !embedUrl && !audio && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <a
              href={tache.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: "0.75rem",
                background: "var(--pb-surface-lowest)",
                border: "1.5px solid var(--pb-outline-variant)",
                fontSize: 13, fontWeight: 700, color: "var(--pb-primary)",
                textDecoration: "none",
              }}
            >
              <span className="ms" style={{ fontSize: 16 }}>open_in_new</span>
              Ouvrir dans un nouvel onglet
            </a>
          </div>
          <iframe
            src={tache.url}
            style={{ width: "100%", height: 600, border: "1.5px solid var(--pb-outline-variant)", borderRadius: "1rem" }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            title={tache.texte ?? tache.label ?? "Exercice en ligne"}
          />
        </div>
      )}

      {isLien && tache.url && (
        <a href={tache.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "var(--pb-on-surface)" }}>
          <div
            style={{
              display: "flex", alignItems: "stretch",
              borderRadius: "1rem", overflow: "hidden",
              border: "1.5px solid var(--pb-outline-variant)",
              background: "white",
              boxShadow: "0 2px 8px rgba(40,43,81,0.06)",
              transition: "box-shadow 0.15s ease",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 24px rgba(40,43,81,0.12)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(40,43,81,0.06)"; }}
          >
            <div style={{ flex: 1, padding: "16px 18px", minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
              {ogMeta?.siteName && (
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--pb-primary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {ogMeta.siteName}
                </div>
              )}
              <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                {ogMeta?.titre || (tache.sous_type === "podcast" ? "Écouter le podcast" : "Ouvrir la ressource")}
              </div>
              {ogMeta?.description && (
                <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                  {ogMeta.description}
                </div>
              )}
              <div style={{ fontSize: 11, color: "var(--pb-on-surface-variant)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {tache.url}
              </div>
            </div>
            {ogMeta?.image ? (
              <div style={{ width: 140, flexShrink: 0, overflow: "hidden" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ogMeta.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            ) : (
              <div style={{ width: 72, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--pb-surface-low)", fontSize: 28 }}>
                {tache.sous_type === "podcast" ? "🎙️" : "🔗"}
              </div>
            )}
          </div>
        </a>
      )}
    </div>
  );
}

function RessourceEleve({
  data,
  bloc,
  session,
  onFait,
  onMarquer,
  onMarquerAvecScore,
}: {
  data: RessourceIA;
  bloc: { id: string };
  session: { id: string; source: "planbox" | "repetibox"; prenom?: string; nom?: string } | null;
  onMarquerAvecScore?: (score: { bon: number; total: number }, statut?: string, reponses?: { id: number; reponse: string; correcte: boolean | null }[]) => void;
  onFait: () => void;
  onMarquer?: () => void;
}) {
  const [qcmVisible, setQcmVisible] = useState(false);
  const [qcmTermine, setQcmTermine] = useState(false);
  const [audioEcoute, setAudioEcoute] = useState(false);

  const hasQcm = !!(data.qcm && data.qcm.length > 0 && data.qcm_id);
  const hasAudio = data.taches?.some(t => t.url && /\.(mp3|ogg|wav|m4a|aac)(\?|$)/i.test(t.url)) ?? false;

  function handleQcmTermine(score: number, total: number, reponses?: { id: number; reponse: string; correcte: boolean }[]) {
    setQcmTermine(true);
    // Sauvegarder le score et les réponses dans plan_travail.contenu
    if (onMarquerAvecScore) {
      onMarquerAvecScore({ bon: score, total }, "fait", reponses?.map(r => ({ ...r, correcte: r.correcte as boolean | null })));
    } else {
      onMarquer?.();
    }
  }

  if (data.taches && data.taches.length > 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {data.taches.map((tache, i) => {
          const isAudio = tache.url ? /\.(mp3|ogg|wav|m4a|aac)(\?|$)/i.test(tache.url) : false;
          return (
            <div
              key={i}
              style={isAudio ? {} : {
                padding: "16px 18px",
                background: "var(--pb-surface-low)",
                border: "1.5px solid var(--pb-surface-container)",
                borderRadius: "1.25rem",
              }}
            >
              <TacheEleve
                tache={tache}
                numero={i + 1}
                total={data.taches!.length}
                onAudioComplete={() => setAudioEcoute(true)}
                onAudioPlay={() => { if (qcmVisible) { setQcmVisible(false); setAudioEcoute(false); } }}
              />
            </div>
          );
        })}

        {hasQcm && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
            {!qcmVisible && !qcmTermine && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {hasAudio && !audioEcoute && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "10px 14px", borderRadius: "0.75rem",
                    background: "var(--pb-surface-low)", fontSize: 13,
                    color: "var(--pb-on-surface-variant)",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}>
                    <span className="ms" style={{ fontSize: 18 }}>headphones</span>
                    Écoute le podcast en entier pour débloquer le questionnaire
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="pb-btn primary"
                    onClick={() => setQcmVisible(true)}
                    disabled={hasAudio && !audioEcoute}
                    style={{
                      flex: 1, padding: "14px", fontSize: 15,
                      opacity: hasAudio && !audioEcoute ? 0.4 : 1,
                      cursor: hasAudio && !audioEcoute ? "not-allowed" : "pointer",
                    }}
                  >
                    <span className="ms" style={{ fontSize: 18 }}>quiz</span>
                    Répondre au questionnaire
                  </button>
                  <Link
                    href={`/eleve/qcm-classement/${data.qcm_id}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "12px 16px", borderRadius: "1rem", fontSize: 13, fontWeight: 700,
                      background: "rgba(248,160,16,0.1)", color: "var(--pb-tertiary)",
                      border: "1.5px solid rgba(248,160,16,0.3)", textDecoration: "none", flexShrink: 0,
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}
                  >
                    <span className="ms" style={{ fontSize: 18, color: "#D97706" }}>emoji_events</span>
                    Podium
                  </Link>
                </div>
              </div>
            )}

            {qcmVisible && !qcmTermine && (
              <QCMPlayer
                questions={data.qcm!}
                qcm_id={data.qcm_id!}
                planTravailId={bloc.id}
                eleveId={session?.source === "planbox" ? session.id : undefined}
                repetiboxEleveId={session?.source === "repetibox" ? parseInt(session.id, 10) : undefined}
                prenom={session?.prenom ?? "Élève"}
                nom={session?.nom ?? ""}
                onTermine={handleQcmTermine}
              />
            )}

            {qcmTermine && (
              <div style={{ display: "flex", gap: 8 }}>
                <Link
                  href={`/eleve/qcm-classement/${data.qcm_id}`}
                  style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    padding: "14px 16px", borderRadius: "1rem",
                    background: "rgba(248,160,16,0.1)", color: "var(--pb-tertiary)",
                    fontWeight: 700, fontSize: 14, textDecoration: "none",
                    border: "1.5px solid rgba(248,160,16,0.3)",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                >
                  <span className="ms" style={{ fontSize: 18 }}>emoji_events</span>
                  Voir le podium
                </Link>
                <Link
                  href="/eleve/dashboard"
                  style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    padding: "14px 16px", borderRadius: "1rem",
                    background: "#dcfce7", color: "#166534",
                    fontWeight: 700, fontSize: 14, textDecoration: "none",
                    border: "1.5px solid #86efac",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                >
                  <span className="ms" style={{ fontSize: 18 }}>check_circle</span>
                  Retour au tableau de bord
                </Link>
              </div>
            )}
          </div>
        )}

        {!hasQcm && (
          <button
            className="pb-btn primary"
            onClick={onFait}
            style={{ width: "100%", padding: "16px", fontSize: 16, marginTop: 4 }}
          >
            <span className="ms" style={{ fontSize: 20 }}>check</span>
            Marquer comme fait
          </button>
        )}
      </div>
    );
  }

  // Ancien format backward compat
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <TacheEleve tache={data} />
      <button
        className="pb-btn primary"
        onClick={onFait}
        style={{ width: "100%", padding: "16px", fontSize: 16, marginTop: 8 }}
      >
        <span className="ms" style={{ fontSize: 20 }}>check</span>
        Marquer comme fait
      </button>
    </div>
  );
}
