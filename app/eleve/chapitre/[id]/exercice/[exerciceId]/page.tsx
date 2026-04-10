"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useEleveSession } from "@/hooks/useEleveSession";
import ClassementEleve from "@/components/ClassementEleve";
import TexteATrousEleve from "@/components/TexteATrousEleve";

interface Question {
  id: number;
  enonce: string;
  reponse_attendue: string;
  indice?: string;
}

interface QCMQuestion {
  question: string;
  options: string[];
  reponse_correcte: number;
  explication?: string;
}

interface Calcul {
  id: number;
  enonce: string;
  reponse: string;
}

interface Exercice {
  id: string;
  titre: string;
  type: string;
  contenu: Record<string, unknown>;
  nb_questions: number;
  chapitre_id: string;
}

type Etat = "chargement" | "en_cours" | "resultat";

export default function PageExerciceEleve() {
  const { id: chapitreId, exerciceId } = useParams<{ id: string; exerciceId: string }>();
  const router = useRouter();
  const { session, chargement: chargementSession } = useEleveSession();

  const [exercice, setExercice] = useState<Exercice | null>(null);
  const [etat, setEtat] = useState<Etat>("chargement");

  // Questions / réponses
  const [questions, setQuestions] = useState<Array<{ enonce: string; reponse: string; indice?: string; options?: string[]; reponseIdx?: number }>>([]);
  const [indexCourant, setIndexCourant] = useState(0);
  const [reponseEleve, setReponseEleve] = useState("");
  const [qcmChoisi, setQcmChoisi] = useState<number | null>(null);
  const [resultats, setResultats] = useState<boolean[]>([]);
  const [afficherCorrection, setAfficherCorrection] = useState(false);

  // Résultat final
  const [score, setScore] = useState(0);
  const [valide, setValide] = useState(false);
  const [enSauvegarde, setEnSauvegarde] = useState(false);
  const [seuilExo, setSeuilExo] = useState(0.9);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (chargementSession) return;
    if (!session) { router.push("/eleve"); return; }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    chargerExercice(ctrl.signal);

    return () => { ctrl.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargementSession, session, chapitreId, exerciceId]);

  async function chargerExercice(signal: AbortSignal) {
    try {
      const [res, chapRes] = await Promise.all([
        fetch(`/api/chapitres/exercices?chapitre_id=${chapitreId}`, { signal }),
        fetch(`/api/admin/chapitres/${chapitreId}`, { signal }),
      ]);
      if (signal.aborted) return;

      const json = await res.json();
      const exos = json.exercices ?? [];
      const ex = exos.find((e: Exercice) => e.id === exerciceId);

      if (!ex) {
        router.push(`/eleve/chapitre/${chapitreId}`);
        return;
      }

      // Charger le seuil de validation des exercices depuis le chapitre
      const chapJson = await chapRes.json();
      if (chapJson.chapitre?.seuil_exercice != null) {
        setSeuilExo(chapJson.chapitre.seuil_exercice / 100);
      }

      setExercice(ex);

      // Préparer les questions selon le type
      const qs: typeof questions = [];
      const contenu = ex.contenu;

      if (ex.type === "exercice" && Array.isArray(contenu.questions)) {
        for (const q of contenu.questions as Question[]) {
          qs.push({ enonce: q.enonce, reponse: q.reponse_attendue, indice: q.indice });
        }
      } else if (ex.type === "qcm" && Array.isArray(contenu.questions)) {
        for (const q of contenu.questions as QCMQuestion[]) {
          qs.push({
            enonce: q.question,
            reponse: q.options[q.reponse_correcte],
            options: q.options,
            reponseIdx: q.reponse_correcte,
          });
        }
      } else if (ex.type === "calcul_mental" && Array.isArray(contenu.calculs)) {
        for (const c of contenu.calculs as Calcul[]) {
          qs.push({ enonce: c.enonce, reponse: String(c.reponse) });
        }
      } else if (ex.type === "texte_a_trous") {
        setEtat("en_cours");
        return;
      } else if (ex.type === "classement") {
        setEtat("en_cours");
        return;
      } else if (ex.type === "analyse_phrase" && Array.isArray(contenu.phrases)) {
        for (const phrase of contenu.phrases as Array<{ texte: string; groupes: Array<{ mots: string; fonction: string }> }>) {
          for (const g of phrase.groupes) {
            qs.push({
              enonce: `Dans la phrase « ${phrase.texte} », quelle est la fonction de « ${g.mots} » ?`,
              reponse: g.fonction,
            });
          }
        }
      }

      // Mélanger les questions
      for (let i = qs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [qs[i], qs[j]] = [qs[j], qs[i]];
      }

      setQuestions(qs);
      setEtat("en_cours");
    } catch (err) {
      if (signal.aborted) return;
      console.error("[chargerExercice]", err);
      router.push(`/eleve/chapitre/${chapitreId}`);
    }
  }

  const normaliser = (s: string) => s.toLowerCase().trim().replace(/[.,;:!?'"()«»]/g, "").replace(/\s+/g, " ");

  const verifierReponse = useCallback(() => {
    const q = questions[indexCourant];
    if (!q) return;

    let correct = false;
    if (q.options && qcmChoisi !== null) {
      correct = qcmChoisi === q.reponseIdx;
    } else {
      correct = normaliser(reponseEleve) === normaliser(q.reponse);
    }

    setResultats((prev) => [...prev, correct]);
    setAfficherCorrection(true);
  }, [indexCourant, questions, reponseEleve, qcmChoisi]);

  async function passerSuivant() {
    setAfficherCorrection(false);
    setReponseEleve("");
    setQcmChoisi(null);

    if (indexCourant + 1 >= questions.length) {
      // Fin de l'exercice — calculer le score et sauvegarder
      const bonnes = resultats.filter(Boolean).length;
      const total = questions.length;
      const estValide = total > 0 && (bonnes / total) >= seuilExo;

      setScore(bonnes);
      setValide(estValide);
      setEtat("resultat");

      // Sauvegarder le résultat
      setEnSauvegarde(true);
      await fetch("/api/chapitres/exercices/resultat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exercice_id: exerciceId,
          eleve_id: session?.source === "planbox" ? session.id : undefined,
          rb_eleve_id: session?.source === "repetibox" ? parseInt(session.id, 10) : undefined,
          score: bonnes,
          total,
        }),
      });
      setEnSauvegarde(false);
    } else {
      setIndexCourant((prev) => prev + 1);
    }
  }

  // ── Écriture contrainte ──────────────────────────────────────────────
  const [texteEleve, setTexteEleve] = useState("");
  const [tentative, setTentative] = useState(1);
  const [analyseIA, setAnalyseIA] = useState<{
    valide: boolean;
    erreurs: Array<{ phrase: string; type: string; indice: string; mot_concerne?: string }>;
    commentaire: string;
    nb_phrases_ecrites: number;
    score: number;
  } | null>(null);
  const [enAnalyse, setEnAnalyse] = useState(false);
  const [ecritureValide, setEcritureValide] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function soumettreEcriture() {
    if (!exercice || !texteEleve.trim()) return;
    setEnAnalyse(true);
    setAnalyseIA(null);
    try {
      const rawContenu = exercice.contenu;
      const contenu = (Array.isArray(rawContenu) ? rawContenu[0] : rawContenu) as Record<string, unknown>;
      const res = await fetch("/api/chapitres/exercices/corriger-ecriture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texte: texteEleve.trim(),
          consigne: contenu.consigne,
          contraintes: contenu.contraintes,
          nb_phrases: contenu.nb_phrases ?? 3,
          tentative,
        }),
      });
      const analyse = await res.json();
      setAnalyseIA(analyse);

      if (analyse.valide) {
        setEcritureValide(true);
        // Sauvegarder le résultat
        const total = (contenu.contraintes as string[])?.length ?? 1;
        await fetch("/api/chapitres/exercices/resultat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exercice_id: exerciceId,
            eleve_id: session?.source === "planbox" ? session.id : undefined,
            rb_eleve_id: session?.source === "repetibox" ? parseInt(session.id, 10) : undefined,
            score: total,
            total,
          }),
        });
      } else if (tentative === 1) {
        setTentative(2);
      } else {
        // 2e tentative échouée — sauvegarder l'échec
        const total = (contenu.contraintes as string[])?.length ?? 1;
        await fetch("/api/chapitres/exercices/resultat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exercice_id: exerciceId,
            eleve_id: session?.source === "planbox" ? session.id : undefined,
            rb_eleve_id: session?.source === "repetibox" ? parseInt(session.id, 10) : undefined,
            score: analyse.score ?? 0,
            total,
          }),
        });
      }
    } catch {
      setAnalyseIA({ valide: false, erreurs: [], commentaire: "Erreur lors de l'analyse. Réessaie.", nb_phrases_ecrites: 0, score: 0 });
    }
    setEnAnalyse(false);
  }

  // ── Rendu ──────────────────────────────────────────────────────────────

  if (etat === "chargement") {
    return (
      <div style={{ maxWidth: 800, margin: "60px auto", padding: "0 20px", textAlign: "center" }}>
        <div className="skeleton" style={{ height: 200, borderRadius: 20 }} />
      </div>
    );
  }

  // ── Classement : rendu spécial via ClassementEleve ──
  // ── Texte à trous : rendu spécial via TexteATrousEleve ──
  if (exercice?.type === "texte_a_trous" && etat === "en_cours") {
    const contenu = exercice.contenu as Record<string, unknown>;
    const texteComplet = (contenu.texte_complet as string) ?? (contenu.texte as string) ?? "";
    const trousBruts = (contenu.trous as Array<{ position: number; mot: string; indice?: string }>) ?? [];

    // Recalculer les positions réelles : les positions en base sont séquentielles (0,1,2...)
    // mais le composant attend l'index du mot dans le texte splitté par espaces
    const mots = texteComplet.split(/\s+/);
    const trousAvecPositions: Array<{ position: number; mot: string; indice?: string }> = [];
    const positionsUtilisees = new Set<number>();

    for (const trou of trousBruts) {
      // Chercher le mot dans le texte (en nettoyant la ponctuation pour la comparaison)
      const motNettoye = trou.mot.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      let found = false;
      for (let i = 0; i < mots.length; i++) {
        if (positionsUtilisees.has(i)) continue;
        const motTexteNettoye = mots[i].replace(/[.,;:!?'"()«»]/g, "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (motTexteNettoye === motNettoye) {
          trousAvecPositions.push({ ...trou, position: i });
          positionsUtilisees.add(i);
          found = true;
          break;
        }
      }
      if (!found) {
        // Fallback : garder la position originale
        trousAvecPositions.push(trou);
      }
    }

    return (
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "20px 20px 80px" }}>
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => router.push(`/eleve/chapitre/${chapitreId}`)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pb-on-surface-variant)", fontSize: 13, marginBottom: 8 }}
          >
            ← Retour
          </button>
          <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface)", marginBottom: 4 }}>
            📝 {exercice.titre}
          </h2>
        </div>

        <TexteATrousEleve
          titre={exercice.titre}
          consigne={String(contenu.consigne ?? "Complète le texte en trouvant les mots manquants.")}
          texteComplet={texteComplet}
          trous={trousAvecPositions}
          onTermine={async (scoreResult) => {
            const total = trousAvecPositions.length;
            const bon = scoreResult.bon;

            await fetch("/api/chapitres/exercices/resultat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                exercice_id: exerciceId,
                eleve_id: session?.source === "planbox" ? session.id : undefined,
                rb_eleve_id: session?.source === "repetibox" ? parseInt(session.id, 10) : undefined,
                score: bon,
                total,
              }),
            });

            setScore(bon);
            setValide(total > 0 && (bon / total) >= seuilExo);
            setEtat("resultat");
          }}
        />
      </div>
    );
  }

  // ── Classement : rendu spécial via ClassementEleve ──
  if (exercice?.type === "classement" && etat === "en_cours") {
    const contenu = exercice.contenu as Record<string, unknown>;
    const categories = (contenu.categories as string[]) ?? [];
    const items = (contenu.items as Array<{ texte: string; categorie: string }>) ?? [];

    return (
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "20px 20px 80px" }}>
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => router.push(`/eleve/chapitre/${chapitreId}`)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pb-on-surface-variant)", fontSize: 13, marginBottom: 8 }}
          >
            ← Retour
          </button>
          <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface)", marginBottom: 4 }}>
            🏷️ {exercice.titre}
          </h2>
        </div>

        <ClassementEleve
          titre={exercice.titre}
          consigne={String(contenu.consigne ?? "Classe chaque élément dans la bonne catégorie.")}
          categories={categories}
          items={items}
          onTermine={async (scoreResult) => {
            const total = items.length;
            const bon = scoreResult.bon;
            const isValide = bon / total >= seuilExo;

            await fetch("/api/chapitres/exercices/resultat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                exercice_id: exerciceId,
                eleve_id: session?.source === "planbox" ? session.id : undefined,
                rb_eleve_id: session?.source === "repetibox" ? parseInt(session.id, 10) : undefined,
                score: bon,
                total,
              }),
            });

            if (isValide) {
              setScore(bon);
              setValide(true);
              setEtat("resultat");
            } else {
              setScore(bon);
              setValide(false);
              setEtat("resultat");
            }
          }}
        />
      </div>
    );
  }

  // ── Écriture contrainte : rendu spécial ──
  if (exercice?.type === "ecriture_contrainte" && etat === "en_cours") {
    // Le contenu peut être un tableau (ancien format) ou un objet unique
    const rawContenu = exercice.contenu;
    const contenu = (Array.isArray(rawContenu) ? rawContenu[0] : rawContenu) as Record<string, unknown>;
    const contraintes = (contenu.contraintes as string[]) ?? [];
    const nbPhrases = (contenu.nb_phrases as number) ?? 3;
    const exemple = contenu.exemple as string | undefined;

    return (
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 20px 80px" }}>
        {/* En-tête */}
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => router.push(`/eleve/chapitre/${chapitreId}`)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pb-on-surface-variant)", fontSize: 13, marginBottom: 8 }}
          >
            ← Retour
          </button>
          <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface)", marginBottom: 4 }}>
            ✏️ {exercice.titre}
          </h2>
          <span style={{
            display: "inline-block", fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
            textTransform: "uppercase", padding: "4px 12px", borderRadius: 999,
            background: "rgba(124,58,237,0.08)", color: "#7C3AED",
          }}>
            Tentative {tentative}/2
          </span>
        </div>

        {/* Layout 2 colonnes sur tablette/desktop */}
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>

          {/* Colonne gauche : consigne + écriture + bouton */}
          <div style={{ flex: "1 1 400px", minWidth: 0 }}>
            {/* Consigne */}
            <div style={{
              padding: "20px 24px", borderRadius: 20, marginBottom: 16,
              background: "linear-gradient(135deg, #EDE9FE, #F5F3FF)",
              border: "1px solid rgba(124,58,237,0.15)",
            }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: "#5B21B6", marginBottom: 10, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                📝 {String(contenu.consigne)}
              </p>
              <div style={{ fontSize: 13, color: "#6D28D9" }}>
                <strong>Contraintes :</strong>
                <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
                  {contraintes.map((c, i) => (
                    <li key={i} style={{ marginBottom: 3 }}>{c}</li>
                  ))}
                </ul>
              </div>
              <p style={{ fontSize: 13, color: "#6D28D9", marginTop: 8 }}>
                Écris <strong>{nbPhrases} phrase{nbPhrases > 1 ? "s" : ""}</strong>.
              </p>
              {exemple && (
                <p style={{ fontSize: 12, color: "#7C3AED", marginTop: 8, fontStyle: "italic", opacity: 0.8 }}>
                  💡 Exemple : « {exemple} »
                </p>
              )}
            </div>

            {/* Zone d'écriture */}
            <div style={{
              padding: "20px", borderRadius: 20, background: "white",
              border: "1px solid var(--pb-outline-variant, #eee)",
              boxShadow: "0 2px 12px rgba(0,0,0,0.04)", marginBottom: 16,
            }}>
              <textarea
                ref={textareaRef}
                value={texteEleve}
                onChange={(e) => setTexteEleve(e.target.value)}
                placeholder={`Écris tes ${nbPhrases} phrases ici…`}
                disabled={enAnalyse || ecritureValide}
                rows={8}
                style={{
                  width: "100%", padding: "14px", borderRadius: 12,
                  fontSize: 15, lineHeight: 1.7, resize: "vertical",
                  border: "2px solid var(--pb-outline-variant, #ddd)",
                  outline: "none", fontFamily: "'Plus Jakarta Sans', sans-serif",
                  background: ecritureValide ? "#F0FDF4" : "white",
                }}
              />
            </div>

            {/* Bouton soumettre */}
            {!ecritureValide && (
              <button
                onClick={soumettreEcriture}
                disabled={enAnalyse || !texteEleve.trim()}
                style={{
                  width: "100%", padding: "14px", borderRadius: 14, fontSize: 16, fontWeight: 700,
                  background: enAnalyse ? "#9CA3AF" : texteEleve.trim() ? "#7C3AED" : "var(--pb-surface-container, #eee)",
                  color: texteEleve.trim() ? "white" : "var(--pb-on-surface-variant)",
                  border: "none", cursor: enAnalyse ? "wait" : "pointer",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                {enAnalyse
                  ? "Analyse en cours… ✨"
                  : analyseIA
                    ? "Soumettre ma correction"
                    : "Vérifier mon texte"}
              </button>
            )}
          </div>

          {/* Colonne droite : feedback IA / résultat */}
          <div style={{ flex: "1 1 340px", minWidth: 0 }}>
            {/* Feedback IA */}
            {analyseIA && !ecritureValide && (
              <div style={{
                padding: "20px 24px", borderRadius: 20,
                background: analyseIA.erreurs.length === 0 ? "#F0FDF4" : "#FFF7ED",
                border: `1px solid ${analyseIA.erreurs.length === 0 ? "rgba(34,197,94,0.3)" : "rgba(234,88,12,0.2)"}`,
                position: "sticky", top: 20,
              }}>
                <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: analyseIA.erreurs.length === 0 ? "#166534" : "#9A3412" }}>
                  {analyseIA.commentaire}
                </p>

                {analyseIA.erreurs.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {analyseIA.erreurs.map((err, i) => (
                      <div key={i} style={{
                        padding: "12px 14px", borderRadius: 12,
                        background: "rgba(234,88,12,0.06)", border: "1px solid rgba(234,88,12,0.12)",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                          {err.mot_concerne && (
                            <span style={{
                              display: "inline-block", fontSize: 14, fontWeight: 800,
                              padding: "3px 10px", borderRadius: 8,
                              background: "rgba(220,38,38,0.12)", color: "#DC2626",
                              textDecoration: "line-through",
                            }}>
                              « {err.mot_concerne} »
                            </span>
                          )}
                          <span style={{
                            display: "inline-block", fontSize: 10, fontWeight: 700,
                            padding: "2px 8px", borderRadius: 6,
                            background: "rgba(234,88,12,0.1)", color: "#C2410C",
                            textTransform: "uppercase", letterSpacing: "0.05em",
                          }}>
                            {err.type.replace(/_/g, " ")}
                          </span>
                        </div>
                        <p style={{ fontSize: 13, color: "#78350F", margin: 0 }}>
                          💡 {err.indice}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {tentative === 2 && analyseIA.erreurs.length > 0 && (
                  <p style={{ fontSize: 13, color: "#DC2626", fontWeight: 600, marginTop: 12 }}>
                    Des erreurs persistent. Corrige ton texte et réessaie.
                  </p>
                )}
              </div>
            )}

            {/* Résultat validé */}
            {ecritureValide && analyseIA && (
              <div style={{
                padding: "30px", borderRadius: 20, textAlign: "center",
                background: "linear-gradient(135deg, #DCFCE7, #F0FDF4)",
                border: "2px solid #22C55E",
              }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: "#166534", marginBottom: 8, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  Exercice validé !
                </h3>
                <p style={{ fontSize: 14, color: "#166534" }}>{analyseIA.commentaire}</p>
                <button
                  onClick={() => router.push(`/eleve/chapitre/${chapitreId}`)}
                  style={{
                    marginTop: 16, padding: "12px 28px", borderRadius: 12,
                    fontSize: 15, fontWeight: 700, background: "#22C55E", color: "white",
                    border: "none", cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                >
                  Continuer →
                </button>
              </div>
            )}

            {/* Placeholder avant soumission */}
            {!analyseIA && !ecritureValide && (
              <div style={{
                padding: "30px 24px", borderRadius: 20, textAlign: "center",
                background: "rgba(124,58,237,0.04)", border: "1px dashed rgba(124,58,237,0.2)",
                color: "#7C3AED", opacity: 0.6,
              }}>
                <span className="ms" style={{ fontSize: 36, display: "block", marginBottom: 8 }}>rate_review</span>
                <p style={{ fontSize: 13, margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  La correction apparaîtra ici
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (etat === "resultat") {
    return (
      <div style={{ maxWidth: 800, margin: "40px auto", padding: "0 20px", textAlign: "center" }}>
        <div style={{
          padding: "40px 30px", borderRadius: 24,
          background: valide
            ? "linear-gradient(135deg, #DCFCE7, #F0FDF4)"
            : "linear-gradient(135deg, #FEF2F2, #FFF)",
          border: valide ? "2px solid #22C55E" : "2px solid #F87171",
        }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>
            {valide ? "🎉" : "💪"}
          </div>
          <h2 style={{
            fontSize: 22, fontWeight: 800, marginBottom: 8,
            color: valide ? "#166534" : "#991B1B",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}>
            {valide ? "Exercice validé !" : "Pas encore…"}
          </h2>
          <p style={{ fontSize: 16, color: "var(--pb-on-surface-variant)", marginBottom: 4 }}>
            {score}/{questions.length || exercice?.nb_questions || "?"} bonnes réponses
          </p>
          <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", marginBottom: 24 }}>
            {valide
              ? "Tu peux passer à la suite !"
              : "Il faut au moins 90% pour valider. Réessaie !"}
          </p>

          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            {!valide && (
              <button
                onClick={() => {
                  // Reset et recommencer
                  setIndexCourant(0);
                  setResultats([]);
                  setReponseEleve("");
                  setQcmChoisi(null);
                  setAfficherCorrection(false);
                  // Re-mélanger
                  const qs = [...questions];
                  for (let i = qs.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [qs[i], qs[j]] = [qs[j], qs[i]];
                  }
                  setQuestions(qs);
                  setEtat("en_cours");
                }}
                style={{
                  padding: "12px 24px", borderRadius: 12, fontSize: 15, fontWeight: 700,
                  background: "#DC2626", color: "white", border: "none", cursor: "pointer",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                🔄 Réessayer
              </button>
            )}
            <button
              onClick={() => router.push(`/eleve/chapitre/${chapitreId}`)}
              style={{
                padding: "12px 24px", borderRadius: 12, fontSize: 15, fontWeight: 700,
                background: valide ? "#22C55E" : "var(--pb-surface-container, #f0f0f0)",
                color: valide ? "white" : "var(--pb-on-surface)",
                border: "none", cursor: "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              {valide ? "Continuer →" : "Retour au parcours"}
            </button>
          </div>
        </div>

        {enSauvegarde && (
          <p style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", marginTop: 12 }}>
            Sauvegarde en cours…
          </p>
        )}
      </div>
    );
  }

  // ── En cours ──────────────────────────────────────────────────────────

  const q = questions[indexCourant];
  if (!q) return null;

  const isQCM = q.options && q.options.length > 0;

  const consigneExo = exercice?.contenu ? String((exercice.contenu as Record<string, unknown>).consigne ?? "") : "";

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "20px 20px 80px", display: "flex", flexDirection: "column", minHeight: "calc(100vh - 100px)", justifyContent: "center" }}>
      {/* En-tête */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => router.push(`/eleve/chapitre/${chapitreId}`)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pb-on-surface-variant)", fontSize: 13, marginBottom: 8 }}
        >
          ← Retour
        </button>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface)" }}>
            {exercice?.titre}
          </h2>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--pb-primary)", whiteSpace: "nowrap", marginLeft: 16 }}>
            {indexCourant + 1}/{questions.length}
          </span>
        </div>

        {/* Barre progression */}
        <div style={{ height: 6, background: "var(--pb-surface-container, #f0f0f0)", borderRadius: 100, overflow: "hidden" }}>
          <div style={{
            width: `${((indexCourant) / questions.length) * 100}%`,
            height: "100%", background: "var(--pb-primary)", borderRadius: 100,
            transition: "width 0.3s ease",
          }} />
        </div>

        {/* Dots résultats */}
        <div style={{ display: "flex", gap: 5, marginTop: 10, justifyContent: "center" }}>
          {questions.map((_, i) => (
            <div key={i} style={{
              width: 10, height: 10, borderRadius: "50%",
              background: i < resultats.length
                ? resultats[i] ? "#22C55E" : "#EF4444"
                : i === indexCourant ? "var(--pb-primary)" : "var(--pb-outline-variant, #ddd)",
              transition: "background 0.2s",
            }} />
          ))}
        </div>
      </div>

      {/* Consigne */}
      {consigneExo && (
        <div style={{
          padding: "14px 20px", borderRadius: 14, marginBottom: 20,
          background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.15)",
          display: "flex", alignItems: "flex-start", gap: 10,
        }}>
          <span className="ms" style={{ fontSize: 18, color: "#2563EB", flexShrink: 0, marginTop: 1 }}>info</span>
          <p style={{ fontSize: 14, color: "#1E40AF", margin: 0, lineHeight: 1.5 }}>{consigneExo}</p>
        </div>
      )}

      {/* Question */}
      <div style={{
        padding: "36px 32px", borderRadius: 24, background: "white",
        border: "1px solid var(--pb-outline-variant, #eee)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
        marginBottom: 24,
      }}>
        <p style={{
          fontSize: 20, fontWeight: 700, marginBottom: 24, lineHeight: 1.5,
          color: "var(--pb-on-surface)", textAlign: "center",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}>
          {q.enonce}
        </p>

        {/* Champ réponse */}
        {isQCM ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem" }}>
            {q.options!.map((opt, oi) => {
              let bg = "white";
              let borderColor = "var(--border, #E2E8F0)";
              let textColor = "var(--text-primary, #1A202C)";

              if (afficherCorrection) {
                if (oi === q.reponseIdx) {
                  borderColor = "var(--accent, #16A34A)"; bg = "#F0FAF5"; textColor = "var(--accent, #16A34A)";
                } else if (oi === qcmChoisi && oi !== q.reponseIdx) {
                  borderColor = "#E53E3E"; bg = "#FFF5F5"; textColor = "#E53E3E";
                }
              } else if (qcmChoisi === oi) {
                borderColor = "#3B82F6"; bg = "#EFF6FF"; textColor = "#1D4ED8";
              }

              return (
                <button key={oi} onClick={() => !afficherCorrection && setQcmChoisi(oi)} style={{
                  padding: "1rem 1.25rem", borderRadius: "0.875rem", fontSize: "0.9375rem", fontWeight: 500,
                  backgroundColor: bg, border: `1px solid ${borderColor}`, color: textColor,
                  cursor: afficherCorrection ? "default" : "pointer",
                  textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "inherit", transition: "all 0.15s ease",
                }}>
                  {opt}
                  {afficherCorrection && oi === q.reponseIdx && <span style={{ marginLeft: "0.5rem" }}>✓</span>}
                  {afficherCorrection && oi === qcmChoisi && oi !== q.reponseIdx && <span style={{ marginLeft: "0.5rem" }}>✗</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <div>
            <input
              type="text"
              value={reponseEleve}
              onChange={(e) => setReponseEleve(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !afficherCorrection && reponseEleve.trim() && verifierReponse()}
              placeholder="Ta réponse…"
              disabled={afficherCorrection}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              style={{
                width: "100%", padding: "16px 20px", borderRadius: 14,
                fontSize: 18, fontWeight: 500, textAlign: "center",
                border: afficherCorrection
                  ? resultats[resultats.length - 1]
                    ? "2px solid #22C55E"
                    : "2px solid #EF4444"
                  : "2px solid var(--pb-outline-variant, #ddd)",
                background: afficherCorrection
                  ? resultats[resultats.length - 1]
                    ? "#F0FDF4"
                    : "#FEF2F2"
                  : "white",
                outline: "none",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            />
            {afficherCorrection && !resultats[resultats.length - 1] && (
              <p style={{ fontSize: 15, color: "#DC2626", marginTop: 10, textAlign: "center" }}>
                Réponse : <strong>{q.reponse}</strong>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Bouton action */}
      {!afficherCorrection ? (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            onClick={verifierReponse}
            disabled={isQCM ? qcmChoisi === null : !reponseEleve.trim()}
            style={{
              width: "auto", padding: "0.875rem 2.5rem", borderRadius: 999, fontSize: 15, fontWeight: 700,
              background: (isQCM ? qcmChoisi !== null : reponseEleve.trim()) ? "var(--pb-primary)" : "var(--pb-surface-container, #eee)",
              color: (isQCM ? qcmChoisi !== null : reponseEleve.trim()) ? "white" : "var(--pb-on-surface-variant)",
              border: "none",
              cursor: (isQCM ? qcmChoisi !== null : reponseEleve.trim()) ? "pointer" : "not-allowed",
              opacity: (isQCM ? qcmChoisi !== null : reponseEleve.trim()) ? 1 : 0.5,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            ✓ Valider ma réponse
          </button>
        </div>
      ) : (
        <button
          onClick={passerSuivant}
          style={{
            width: "100%", padding: "16px", borderRadius: 16, fontSize: 17, fontWeight: 700,
            background: resultats[resultats.length - 1] ? "#22C55E" : "#F59E0B",
            color: "white", border: "none", cursor: "pointer",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          {indexCourant + 1 >= questions.length ? "Voir le résultat" : "Question suivante →"}
        </button>
      )}
    </div>
  );
}
