"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useEleveSession } from "@/hooks/useEleveSession";
import { domaineParSlug } from "@/lib/ceintures-competences";

interface QuestionPosee {
  item_code: string;
  question: string;
  options: string[];
}

interface Donnees {
  deja_passe: boolean;
  domaine: { code: string; nom: string; slug: string };
  ceinture_idx: number;
  titre: string;
  chapitre_id: string;
  items: { code: string; libelle: string }[];
  questions: QuestionPosee[];
}

interface Resultat {
  nb_correct: number;
  nb_total: number;
  items_acquis: string[];
  items_a_travailler: { code: string; libelle: string }[];
  chapitre_id: string;
}

/** Temps d'affichage du choix avant de passer à la suite. */
const DELAI_SUIVANTE = 320;

/**
 * Le test de départ d'une ceinture : 2 QCM par item, posés UN PAR UN.
 * Répondre fait passer à la question suivante.
 *
 * Aucune correction n'est affichée pendant la passation — c'est un état des
 * lieux, pas un exercice. Les items réussis sont validés à la remise, et
 * l'élève arrive sur la page chapitre exactement là où il doit travailler.
 */
export default function DiagnosticPage() {
  const { domaine: slug, idx } = useParams<{ domaine: string; idx: string }>();
  const router = useRouter();
  const { session, chargement: chargementSession } = useEleveSession();

  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [reponses, setReponses] = useState<number[]>([]);
  const [courante, setCourante] = useState(0);
  const [enTransition, setEnTransition] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const codeDomaine = domaineParSlug(slug ?? "")?.code ?? "";

  useEffect(() => {
    if (chargementSession) return;
    if (!session) { router.push("/eleve"); return; }

    const ctrl = new AbortController();
    const param = session.source === "planbox"
      ? `eleve_id=${session.id}`
      : `rb_eleve_id=${session.id}`;

    fetch(`/api/ceintures/diagnostic?domaine=${codeDomaine}&idx=${idx}&${param}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((json: Donnees & { erreur?: string }) => {
        if (json.erreur) { setErreur(json.erreur); setChargement(false); return; }
        // Déjà passé : on n'en repropose pas un second, on file au chapitre.
        if (json.deja_passe) {
          router.replace(`/eleve/chapitre/${json.chapitre_id}`);
          return;
        }
        setDonnees(json);
        setReponses(new Array(json.questions.length).fill(-1));
        setChargement(false);
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        console.error("[diagnostic]", err);
        setErreur("Impossible de charger le test.");
        setChargement(false);
      });

    return () => ctrl.abort();
  }, [chargementSession, session, codeDomaine, idx, router]);

  /** Répondre : on montre le choix un instant, puis on enchaîne. */
  function repondre(choix: number) {
    if (!donnees || enTransition || envoi) return;

    const suite = [...reponses];
    suite[courante] = choix;
    setReponses(suite);
    setEnTransition(true);

    setTimeout(() => {
      setEnTransition(false);
      if (courante + 1 < donnees.questions.length) {
        setCourante((i) => i + 1);
      } else {
        envoyer(suite);
      }
    }, DELAI_SUIVANTE);
  }

  async function envoyer(toutesReponses: number[]) {
    if (!session || !donnees || envoi) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const res = await fetch("/api/ceintures/diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domaine: donnees.domaine.code,
          idx: donnees.ceinture_idx,
          eleve_id: session.source === "planbox" ? session.id : undefined,
          rb_eleve_id: session.source === "repetibox" ? parseInt(session.id, 10) : undefined,
          reponses: toutesReponses,
        }),
      });
      const json = await res.json();
      if (json.ok) setResultat(json as Resultat);
      else { setErreur(json.erreur ?? "Enregistrement impossible."); setEnvoi(false); }
    } catch (err) {
      console.error("[diagnostic POST]", err);
      setErreur("Enregistrement impossible.");
      setEnvoi(false);
    }
  }

  if (chargement || chargementSession) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", padding: "0 20px" }}>
        <div className="skeleton" style={{ height: 60, borderRadius: 14, marginBottom: 20 }} />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton" style={{ height: 52, borderRadius: 12, marginBottom: 10 }} />
        ))}
      </div>
    );
  }

  if (erreur && !donnees) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <p>{erreur}</p>
        <Link href={`/eleve/ceintures/${slug}`}>← Retour</Link>
      </div>
    );
  }

  // ── Résultat ──────────────────────────────────────────────────────────
  if (resultat) {
    const nbAcquis = resultat.items_acquis.length;
    return (
      <div style={{ maxWidth: 560, margin: "40px auto", padding: "0 20px" }}>
        <div style={{
          padding: "32px 26px", borderRadius: 22, textAlign: "center",
          background: "linear-gradient(135deg, #EFF6FF, white)",
          border: "2px solid #93C5FD",
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🧭</div>
          <h2 style={{
            fontSize: 20, fontWeight: 800, margin: "0 0 8px",
            fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface)",
          }}>
            Test terminé !
          </h2>
          <p style={{ fontSize: 15, color: "var(--pb-on-surface)", marginBottom: 4, fontWeight: 700 }}>
            {resultat.nb_correct}/{resultat.nb_total} bonnes réponses
          </p>
          <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", marginBottom: 22 }}>
            {nbAcquis > 0
              ? `${nbAcquis} compétence${nbAcquis > 1 ? "s" : ""} déjà acquise${nbAcquis > 1 ? "s" : ""} : tu n'auras pas à ${nbAcquis > 1 ? "les" : "la"} refaire.`
              : "On commence par le début, tranquillement."}
          </p>

          {resultat.items_a_travailler.length > 0 && (
            <div style={{
              textAlign: "left", padding: "16px 18px", borderRadius: 14,
              background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)",
              marginBottom: 22,
            }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#1D4ED8", marginBottom: 10 }}>
                Ce que tu vas travailler :
              </p>
              {resultat.items_a_travailler.map((it) => (
                <div key={it.code} style={{
                  display: "flex", gap: 8, alignItems: "flex-start",
                  fontSize: 13, color: "var(--pb-on-surface)", marginBottom: 6, lineHeight: 1.4,
                }}>
                  <span className="ms" style={{ fontSize: 16, color: "#3B82F6", flexShrink: 0 }}>
                    radio_button_unchecked
                  </span>
                  {it.libelle}
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => router.push(`/eleve/chapitre/${resultat.chapitre_id}`)}
            style={{
              width: "100%", padding: "14px 24px", borderRadius: 14,
              fontSize: 15, fontWeight: 800, border: "none",
              background: "var(--pb-primary)", color: "white", cursor: "pointer",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            Commencer l&apos;entraînement →
          </button>
        </div>
      </div>
    );
  }

  if (!donnees) return null;

  // ── Envoi en cours, après la dernière question ────────────────────────
  if (envoi) {
    return (
      <div style={{ maxWidth: 560, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
        <div className="skeleton" style={{ height: 180, borderRadius: 22, marginBottom: 16 }} />
        <p style={{ fontSize: 14, color: "var(--pb-on-surface-variant)" }}>
          On regarde ce que tu sais déjà…
        </p>
      </div>
    );
  }

  const q = donnees.questions[courante];
  const total = donnees.questions.length;
  const progression = (courante / total) * 100;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 20px 60px" }}>
      {/* En-tête : quitter, avancement */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <Link
          href={`/eleve/ceintures/${slug}`}
          style={{
            fontSize: 13, color: "var(--pb-on-surface-variant)", textDecoration: "none",
            display: "inline-flex", alignItems: "center", gap: 4,
          }}
        >
          <span className="ms" style={{ fontSize: 18 }}>close</span> Quitter
        </Link>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#3B82F6" }}>
          🧭 Test de départ
        </span>
      </div>

      <h1 style={{
        fontSize: 17, fontWeight: 800, margin: "0 0 4px",
        fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface)",
      }}>
        {donnees.titre}
      </h1>
      <p style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", margin: 0 }}>
        Ce n&apos;est pas noté : ce que tu réussis, tu n&apos;auras pas à le refaire.
      </p>

      <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
        <div style={{
          flex: 1, height: 6, borderRadius: 100, overflow: "hidden",
          background: "var(--pb-surface-container, #f0f0f0)",
        }}>
          <div style={{
            width: `${progression}%`, height: "100%",
            background: "#3B82F6", borderRadius: 100, transition: "width 0.3s ease",
          }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--pb-on-surface)" }}>
          {courante + 1}/{total}
        </span>
      </div>

      {/* La question, seule */}
      <p style={{
        fontSize: 19, fontWeight: 700, lineHeight: 1.45, margin: "0 0 22px",
        color: "var(--pb-on-surface)", fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        {q.question}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {q.options.map((opt, j) => {
          const choisi = reponses[courante] === j;
          return (
            <button
              key={j}
              onClick={() => repondre(j)}
              disabled={enTransition}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "15px 16px", borderRadius: 13, textAlign: "left",
                fontSize: 15, fontWeight: choisi ? 700 : 500,
                fontFamily: "inherit",
                cursor: enTransition ? "default" : "pointer",
                background: choisi ? "rgba(59,130,246,0.10)" : "var(--pb-surface-container, #fafafa)",
                border: choisi ? "2px solid #3B82F6" : "2px solid transparent",
                color: "var(--pb-on-surface)",
                transition: "background 0.15s ease, border-color 0.15s ease",
              }}
            >
              <span style={{
                flexShrink: 0, width: 26, height: 26, borderRadius: "50%",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 800,
                background: choisi ? "#3B82F6" : "transparent",
                border: choisi ? "none" : "1.5px solid var(--pb-outline-variant, #ddd)",
                color: choisi ? "white" : "var(--pb-on-surface-variant)",
              }}>
                {String.fromCharCode(65 + j)}
              </span>
              {opt}
            </button>
          );
        })}
      </div>

      {erreur && (
        <p style={{ fontSize: 13, color: "#DC2626", textAlign: "center", marginTop: 16 }}>
          {erreur}
        </p>
      )}

      {/* Revenir en arrière : pour rattraper un clic malheureux, sans correction. */}
      {courante > 0 && (
        <button
          onClick={() => !enTransition && setCourante((i) => i - 1)}
          style={{
            marginTop: 22, padding: "8px 14px", borderRadius: 10,
            background: "transparent", border: "none", cursor: "pointer",
            fontSize: 13, fontFamily: "inherit",
            color: "var(--pb-on-surface-variant)",
            display: "inline-flex", alignItems: "center", gap: 4,
          }}
        >
          <span className="ms" style={{ fontSize: 16 }}>arrow_back</span>
          Question précédente
        </button>
      )}
    </div>
  );
}
