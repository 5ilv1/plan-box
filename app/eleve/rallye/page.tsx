"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PART_ECOUTE_MIN, type EpisodePublic, type LigneClassement } from "@/lib/rallye-bestioles";
import type { EtatRallye, PartiePublique } from "@/app/api/rallye/route";

// Couleurs de la série Bestioles (France Inter × Muséum) : vert jungle et rouge.
const VERT = "#0E3B2E";
const VERT_CLAIR = "#E8F3EC";
const ROUGE = "#E3343F";
const POLICE_TITRE = "'Plus Jakarta Sans', sans-serif";

async function appeler(corps?: object): Promise<{ ok: boolean; json: any }> {
  const r = await fetch("/api/rallye", corps
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) }
    : { cache: "no-store" });
  const json = await r.json().catch(() => ({}));
  return { ok: r.ok, json };
}

export default function RallyePage() {
  const [etat, setEtat] = useState<EtatRallye | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  // Score du podcast qu'on vient de finir, montré avant de choisir le suivant.
  const [resultat, setResultat] = useState<PartiePublique | null>(null);

  function finDuQcm(e: EtatRallye) {
    setEtat(e);
    setResultat(e.derniere);
    window.scrollTo({ top: 0 });
  }

  useEffect(() => {
    appeler().then(({ ok, json }) => {
      if (ok) setEtat(json as EtatRallye);
      else setErreur(json?.erreur ?? "Le rallye ne répond pas. Réessaie dans un instant.");
    }).catch(() => setErreur("Pas de connexion. Réessaie dans un instant."));
  }, []);

  async function choisir(numero: number) {
    if (enCours) return;
    setEnCours(true);
    setErreur(null);
    try {
      const { ok, json } = await appeler({ action: "choisir", fiche: numero });
      if (json?.phase || json?.etat) setEtat((json.etat ?? json) as EtatRallye);
      if (!ok) setErreur(json?.erreur ?? "Impossible de choisir ce podcast.");
    } catch {
      setErreur("Pas de connexion. Réessaie.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="eleve-page" style={{ background: VERT_CLAIR, minHeight: "100vh" }}>
      <style>{STYLES}</style>
      <nav style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(255,255,255,0.9)", backdropFilter: "blur(12px)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 20px",
      }}>
        <Link href="/eleve/dashboard" style={{
          display: "flex", alignItems: "center", gap: 6, color: VERT, fontWeight: 600, fontSize: 14,
          textDecoration: "none", padding: "6px 10px", borderRadius: 12, fontFamily: "Manrope, sans-serif",
        }}>
          <span className="ms" style={{ fontSize: 20 }}>arrow_back</span>
          Retour
        </Link>
        <span style={{ fontFamily: POLICE_TITRE, fontWeight: 800, fontSize: 17, color: VERT }}>
          Rallye Bestioles
        </span>
        <div style={{ width: 60 }} />
      </nav>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "1.5rem 1rem 6rem" }}>
        {erreur && (
          <div style={{ background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FECACA", borderRadius: 14, padding: "12px 16px", marginBottom: 16, fontWeight: 600 }}>
            {erreur}
          </div>
        )}

        {!etat && !erreur && <p style={{ textAlign: "center", color: VERT, marginTop: 60 }}>Chargement…</p>}

        {etat && !etat.actif && (
          <Encart titre="Le rallye est fermé" texte="Ton enseignant n'a pas ouvert le Rallye Bestioles pour le moment." />
        )}

        {etat?.actif && resultat && (
          <Resultat etat={etat} partie={resultat} onContinuer={() => { setResultat(null); window.scrollTo({ top: 0 }); }} />
        )}

        {etat?.actif && !resultat && etat.phase === "choix" && (
          <Choix etat={etat} onChoisir={choisir} enCours={enCours} />
        )}

        {etat?.actif && !resultat && etat.phase === "partie" && etat.partie && (
          <Partie key={etat.partie.episode.numero} partie={etat.partie} onEtat={finDuQcm} />
        )}

        {etat?.actif && !resultat && etat.phase === "termine_tout" && (
          <>
            <Encart titre="Bravo, tu as tout écouté ! 🎉" texte="Tu as fait tous les podcasts du rallye." />
            <Classement etat={etat} />
          </>
        )}
      </main>
    </div>
  );
}

// ── Choix du podcast ─────────────────────────────────────────────────────────

function Choix({ etat, onChoisir, enCours }: { etat: EtatRallye; onChoisir: (n: number) => void; enCours: boolean }) {
  const [confirme, setConfirme] = useState<EpisodePublic | null>(null);
  return (
    <>
      <header style={{ textAlign: "center", marginBottom: 24 }}>
        <h1 style={{ fontFamily: POLICE_TITRE, fontSize: "clamp(1.6rem, 5vw, 2.2rem)", fontWeight: 800, color: VERT, margin: 0 }}>
          Choisis ta bestiole, {etat.prenom} !
        </h1>
        <p style={{ color: "#3F5F52", fontSize: 15, marginTop: 8, lineHeight: 1.5 }}>
          Écoute le podcast jusqu&apos;au bout, puis réponds aux 5 questions.<br />
          Chaque bonne réponse rapporte 1 point. Attention : un podcast choisi ne revient pas !
        </p>
      </header>

      <div className="rallye-choix">
        {etat.propositions.map((ep) => (
          <button key={ep.numero} type="button" className="rallye-episode" disabled={enCours}
            onClick={() => setConfirme(ep)}>
            {ep.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ep.image} alt="" loading="lazy" style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", display: "block" }} />
            )}
            <div style={{ padding: "14px 16px 18px", textAlign: "left" }}>
              <div style={{ fontFamily: POLICE_TITRE, fontWeight: 800, fontSize: 18, color: VERT }}>{ep.animal}</div>
              <div style={{ fontSize: 13, color: "#4B6358", marginTop: 4, lineHeight: 1.4 }}>{ep.titre}</div>
            </div>
          </button>
        ))}
      </div>

      {confirme && (
        <div role="dialog" aria-modal="true" style={{
          position: "fixed", inset: 0, background: "rgba(14,59,46,0.55)", zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }} onClick={() => !enCours && setConfirme(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "white", borderRadius: 24, padding: "28px 24px", maxWidth: 420, width: "100%", textAlign: "center",
            boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          }}>
            <div style={{ fontSize: 40 }}>🎧</div>
            <h2 style={{ fontFamily: POLICE_TITRE, fontWeight: 800, color: VERT, fontSize: 22, margin: "8px 0" }}>{confirme.animal}</h2>
            <p style={{ color: "#4B6358", fontSize: 15, lineHeight: 1.5, margin: "0 0 20px" }}>
              Tu choisis ce podcast ? Tu ne pourras plus en changer avant d&apos;avoir répondu aux questions.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button type="button" className="rallye-btn rallye-btn-secondaire" disabled={enCours} onClick={() => setConfirme(null)}>
                Non, je regarde encore
              </button>
              <button type="button" className="rallye-btn" disabled={enCours} onClick={() => onChoisir(confirme.numero)}>
                {enCours ? "…" : "Oui, c'est parti !"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Classement etat={etat} replie />
    </>
  );
}

// ── Écoute puis QCM ──────────────────────────────────────────────────────────

function Partie({ partie, onEtat }: { partie: PartiePublique; onEtat: (e: EtatRallye) => void }) {
  // Une partie déjà commencée (au moins une réponse) reprend directement au QCM.
  const dejaCommence = partie.reponses.some((r) => r !== null);
  const [ecoute, setEcoute] = useState(dejaCommence);
  return ecoute
    ? <QcmCartes partie={partie} onEtat={onEtat} />
    : <Ecoute episode={partie.episode} onFini={() => setEcoute(true)} />;
}

function Ecoute({ episode, onFini }: { episode: EpisodePublic; onFini: () => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const cle = `rallye_ecoute_${episode.numero}`;
  // Secondes réellement écoutées (pas la position : sauter à la fin ne compte pas).
  const ecoutees = useRef(0);
  const derniere = useRef<number | null>(null);
  const [duree, setDuree] = useState(0);
  const [part, setPart] = useState(0);
  const [panne, setPanne] = useState(false);

  useEffect(() => {
    try { ecoutees.current = Number(sessionStorage.getItem(cle)) || 0; } catch { /* stockage indisponible */ }
  }, [cle]);

  const majPart = useCallback((d: number) => {
    if (d > 0) setPart(Math.min(1, ecoutees.current / d));
  }, []);

  function surTemps() {
    const a = audio.current;
    if (!a) return;
    const t = a.currentTime;
    if (derniere.current !== null && !a.seeking) {
      const delta = t - derniere.current;
      if (delta > 0 && delta < 2) {
        ecoutees.current += delta;
        try { sessionStorage.setItem(cle, String(Math.round(ecoutees.current))); } catch { /* ignoré */ }
      }
    }
    derniere.current = t;
    majPart(a.duration || duree);
  }

  const debloque = panne || (duree > 0 && part >= PART_ECOUTE_MIN);

  return (
    <div style={{ background: "white", borderRadius: 24, overflow: "hidden", boxShadow: "0 4px 32px rgba(14,59,46,0.12)" }}>
      {episode.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={episode.image} alt="" style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", display: "block" }} />
      )}
      <div style={{ padding: "22px 22px 26px" }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: ROUGE, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Bestioles · France Inter
        </div>
        <h1 style={{ fontFamily: POLICE_TITRE, fontWeight: 800, color: VERT, fontSize: 24, margin: "6px 0 4px" }}>{episode.animal}</h1>
        <p style={{ color: "#4B6358", fontSize: 15, margin: "0 0 18px" }}>{episode.titre}</p>

        <audio
          ref={audio}
          src={episode.audio}
          controls
          preload="metadata"
          controlsList="nodownload noplaybackrate"
          style={{ width: "100%" }}
          onLoadedMetadata={(e) => { setDuree(e.currentTarget.duration); majPart(e.currentTarget.duration); }}
          onTimeUpdate={surTemps}
          onSeeking={() => { derniere.current = null; }}
          onPause={() => { derniere.current = null; }}
          onError={() => setPanne(true)}
        />

        <div style={{ marginTop: 14, height: 10, borderRadius: 999, background: VERT_CLAIR, overflow: "hidden" }}>
          <div style={{ width: `${Math.round(part * 100)}%`, height: "100%", background: VERT, transition: "width 0.4s ease" }} />
        </div>
        <p style={{ fontSize: 13, color: "#4B6358", marginTop: 8 }}>
          {debloque
            ? "Bien écouté ! Tu peux passer aux questions."
            : "Écoute le podcast jusqu'au bout pour débloquer les questions."}
        </p>

        {panne && (
          <p style={{ fontSize: 14, color: "#9A3412", background: "#FFF7ED", borderRadius: 12, padding: "10px 14px" }}>
            Le son ne se lance pas ici. Écoute-le sur{" "}
            <a href={episode.page} target="_blank" rel="noopener noreferrer" style={{ color: "#9A3412", fontWeight: 700 }}>
              le site de France Inter
            </a>
            , puis reviens répondre aux questions.
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
          <button type="button" className="rallye-btn" disabled={!debloque}
            onClick={() => { audio.current?.pause(); onFini(); }}>
            Répondre aux questions →
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Le QCM en cartes empilées, comme les révisions de Repetibox : la carte du
 * dessus porte la question et ses réponses, les suivantes dépassent derrière.
 * Chaque réponse est validée par le serveur, qui seul connaît la bonne.
 */
function QcmCartes({ partie, onEtat }: { partie: PartiePublique; onEtat: (e: EtatRallye) => void }) {
  const premiere = partie.reponses.findIndex((r) => r === null);
  const [index, setIndex] = useState(premiere === -1 ? partie.questions.length - 1 : premiere);
  const [selection, setSelection] = useState<number | null>(null);
  const [resultat, setResultat] = useState<{ bonne: boolean; choix: number; bonnes: number[] } | null>(null);
  const [sortie, setSortie] = useState<"droite" | "gauche" | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [etatFinal, setEtatFinal] = useState<EtatRallye | null>(null);
  const [score, setScore] = useState(partie.score);

  const total = partie.questions.length;
  const q = partie.questions[index];
  const restantes = total - index;

  async function valider() {
    if (selection === null || envoi) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const { ok, json } = await appeler({ action: "repondre", question: index, choix: selection });
      if (!ok) throw new Error(json?.erreur);
      setResultat({ bonne: json.bonne, choix: json.choix, bonnes: json.bonnes });
      if (json.etat) {
        const e = json.etat as EtatRallye;
        setScore(e.partie?.score ?? score);
        if (e.phase !== "partie") setEtatFinal(e);
      }
    } catch (err) {
      setErreur((err as Error)?.message || "Réponse non enregistrée. Réessaie.");
    } finally {
      setEnvoi(false);
    }
  }

  function suivant() {
    if (!resultat) return;
    setSortie(resultat.bonne ? "droite" : "gauche");
    setTimeout(() => {
      setSortie(null);
      setResultat(null);
      setSelection(null);
      if (index + 1 >= total) {
        if (etatFinal) onEtat(etatFinal);
        else appeler().then(({ ok, json }) => { if (ok) onEtat(json as EtatRallye); });
      } else {
        setIndex(index + 1);
      }
    }, 380);
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, color: VERT, fontWeight: 700 }}>
        <span>{partie.episode.animal}</span>
        <span>Question {index + 1} / {total} · ⭐ {score}</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: "white", overflow: "hidden", marginBottom: 28 }}>
        <div style={{ width: `${((index + (resultat ? 1 : 0)) / total) * 100}%`, height: "100%", background: VERT, transition: "width 0.3s ease" }} />
      </div>

      <div style={{ position: "relative" }}>
        {restantes >= 3 && <div className="rallye-carte-fond" style={{ transform: "translateY(20px) scale(0.92)", zIndex: 1 }} />}
        {restantes >= 2 && <div className="rallye-carte-fond" style={{ transform: "translateY(10px) scale(0.96)", zIndex: 2, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }} />}

        <div
          key={index}
          className={sortie === "droite" ? "rallye-sortir-droite" : sortie === "gauche" ? "rallye-sortir-gauche" : "rallye-entrer"}
          style={{
            position: "relative", zIndex: 10, background: "white",
            border: `2px solid ${resultat ? (resultat.bonne ? "#16A34A" : "#DC2626") : "transparent"}`,
            borderRadius: 24, boxShadow: "0 4px 32px rgba(14,59,46,0.14)",
            padding: "2rem 1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem",
            transition: "border-color 0.2s ease",
          }}
        >
          <div style={{
            textAlign: "center", padding: "1.25rem 1rem", borderRadius: 16, background: VERT_CLAIR,
            minHeight: 90, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <p style={{ fontSize: "1.3rem", fontWeight: 700, color: VERT, lineHeight: 1.4, margin: 0 }}>{q.question}</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {q.options.map((opt, i) => {
              const choisie = resultat ? resultat.choix === i : selection === i;
              const juste = resultat?.bonnes.includes(i);
              let bord = "#D1DDD6", fond = "white", texte = "#1F2D27";
              if (!resultat && choisie) { bord = "#3B82F6"; fond = "#EFF6FF"; texte = "#1D4ED8"; }
              if (resultat && juste) { bord = "#16A34A"; fond = "#F0FDF4"; texte = "#166534"; }
              else if (resultat && choisie) { bord = "#DC2626"; fond = "#FEF2F2"; texte = "#B91C1C"; }
              return (
                <button key={i} type="button" disabled={!!resultat || envoi}
                  onClick={() => setSelection(i)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                    background: fond, border: `2px solid ${bord}`, borderRadius: 14, padding: "14px 16px",
                    fontSize: 16, color: texte, cursor: resultat ? "default" : "pointer", fontFamily: "inherit",
                    transition: "all 0.15s ease",
                  }}>
                  <span style={{
                    flexShrink: 0, width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                    background: resultat && juste ? "#16A34A" : resultat && choisie ? "#DC2626" : choisie ? "#3B82F6" : VERT_CLAIR,
                    color: (resultat && (juste || choisie)) || choisie ? "white" : VERT, fontWeight: 800,
                  }}>
                    {resultat && juste ? "✓" : resultat && choisie ? "✗" : "ABC"[i]}
                  </span>
                  <span style={{ flex: 1 }}>{opt}</span>
                </button>
              );
            })}
          </div>

          {resultat && (
            <p style={{ textAlign: "center", fontWeight: 800, fontSize: 18, margin: 0, color: resultat.bonne ? "#16A34A" : "#DC2626" }}>
              {resultat.bonne ? "Bravo ! +1 point" : "Raté… la bonne réponse est en vert."}
            </p>
          )}
          {erreur && <p style={{ textAlign: "center", color: "#B91C1C", margin: 0 }}>{erreur}</p>}

          <div style={{ display: "flex", justifyContent: "center" }}>
            {!resultat ? (
              <button type="button" className="rallye-btn" disabled={selection === null || envoi} onClick={valider}>
                {envoi ? "…" : "✓ Valider ma réponse"}
              </button>
            ) : (
              <button type="button" className="rallye-btn" onClick={suivant}>
                {index + 1 >= total ? "Voir mon score 🏆" : "Suivant →"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Score et classement ──────────────────────────────────────────────────────

function Resultat({ etat, partie: p, onContinuer }: { etat: EtatRallye; partie: PartiePublique; onContinuer: () => void }) {
  return (
    <>
      <div className="rallye-entrer" style={{
        background: `linear-gradient(160deg, ${VERT}, #1B5E47)`, color: "white", borderRadius: 24,
        padding: "28px 22px", textAlign: "center", boxShadow: "0 8px 32px rgba(14,59,46,0.3)",
      }}>
        <div style={{ fontSize: 14, opacity: 0.85, fontWeight: 700 }}>{p.episode.animal}</div>
        <div style={{ fontSize: 13, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 10 }}>Ton score</div>
        <div style={{ fontFamily: POLICE_TITRE, fontSize: "3.4rem", fontWeight: 900, lineHeight: 1.1 }}>
          {p.score} <span style={{ fontSize: "1.6rem", opacity: 0.8 }}>sur {p.total}</span>
        </div>
        <div style={{ fontSize: 15, marginTop: 6 }}>{messageScore(p.score, p.total)}</div>
        <div style={{
          marginTop: 20, background: "rgba(255,255,255,0.12)", borderRadius: 16, padding: "12px 16px",
          display: "inline-flex", gap: 18, flexWrap: "wrap", justifyContent: "center",
        }}>
          <span>☀️ Aujourd&apos;hui : <strong>{etat.scoreDuJour} point{etat.scoreDuJour > 1 ? "s" : ""}</strong></span>
          <span>⭐ Score global : <strong>{etat.scoreGlobal} point{etat.scoreGlobal > 1 ? "s" : ""}</strong></span>
          <span>🎧 {etat.nbJoues} podcast{etat.nbJoues > 1 ? "s" : ""}</span>
        </div>
        {etat.phase !== "termine_tout" && (
          <div style={{ marginTop: 18 }}>
            <button type="button" className="rallye-btn" style={{ background: ROUGE }} onClick={onContinuer}>
              {etat.phase === "partie" ? "Reprendre mon podcast →" : "Choisir une autre bestiole →"}
            </button>
          </div>
        )}
      </div>

      <Correction partie={p} />
      <Classement etat={etat} />
    </>
  );
}

function messageScore(score: number, total: number): string {
  if (score === total) return "Parfait, tu as tout bon ! 🎉";
  if (score >= total - 1) return "Super écoute ! 👏";
  if (score >= Math.ceil(total / 2)) return "Bien joué !";
  return "Courage, tu feras mieux la prochaine fois !";
}

function Correction({ partie }: { partie: PartiePublique }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div style={{ background: "white", borderRadius: 20, marginTop: 16, padding: "14px 18px" }}>
      <button type="button" onClick={() => setOuvert(!ouvert)} style={{
        background: "none", border: "none", width: "100%", display: "flex", justifyContent: "space-between",
        alignItems: "center", fontWeight: 800, color: VERT, fontSize: 15, cursor: "pointer", fontFamily: "inherit", padding: 0,
      }}>
        Revoir mes réponses
        <span className="ms">{ouvert ? "expand_less" : "expand_more"}</span>
      </button>
      {ouvert && (
        <ol style={{ margin: "12px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          {partie.questions.map((q, i) => {
            const r = partie.reponses[i];
            const bonnes = partie.corrections[i] ?? [];
            const juste = r !== null && bonnes.includes(r);
            return (
              <li key={i} style={{ fontSize: 14, lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700 }}>{q.question}</div>
                <div style={{ color: juste ? "#16A34A" : "#DC2626" }}>
                  {juste ? "✓" : "✗"} {r !== null ? q.options[r] : "—"}
                </div>
                {!juste && <div style={{ color: "#166534" }}>Bonne réponse : {bonnes.map((b) => q.options[b]).join(" ou ")}</div>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

const PODIUM = [
  { place: 1, emoji: "🥈", socle: 70, fond: "linear-gradient(160deg,#E2E8F0,#94A3B8)" },
  { place: 0, emoji: "🥇", socle: 110, fond: "linear-gradient(160deg,#FDE68A,#F59E0B)" },
  { place: 2, emoji: "🥉", socle: 50, fond: "linear-gradient(160deg,#FED7AA,#D97706)" },
];

function Classement({ etat, replie = false }: { etat: EtatRallye; replie?: boolean }) {
  const [ouvert, setOuvert] = useState(!replie);
  const lignes = etat.classement;
  return (
    <section style={{ background: "white", borderRadius: 24, marginTop: 20, padding: "20px 18px", boxShadow: "0 2px 12px rgba(14,59,46,0.08)" }}>
      <button type="button" onClick={() => setOuvert(!ouvert)} disabled={!replie} style={{
        background: "none", border: "none", width: "100%", display: "flex", justifyContent: "space-between",
        alignItems: "center", padding: 0, cursor: replie ? "pointer" : "default", fontFamily: "inherit",
      }}>
        <h2 style={{ fontFamily: POLICE_TITRE, fontWeight: 800, color: VERT, fontSize: 20, margin: 0 }}>🏆 Classement de la classe</h2>
        {replie && <span className="ms" style={{ color: VERT }}>{ouvert ? "expand_less" : "expand_more"}</span>}
      </button>

      {ouvert && lignes.length === 0 && (
        <p style={{ color: "#4B6358", marginTop: 12 }}>Personne n&apos;a encore terminé de podcast. À toi de lancer le rallye !</p>
      )}

      {ouvert && lignes.length > 0 && (
        <>
          <div className="rallye-podium">
            {PODIUM.map(({ place, emoji, socle, fond }) => {
              const l = lignes[place];
              return (
                <div key={place} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", minWidth: 0 }}>
                  {l ? (
                    <>
                      <div style={{ fontSize: 28 }}>{emoji}</div>
                      <div style={{ fontWeight: 800, color: VERT, fontSize: 15, textAlign: "center", overflowWrap: "anywhere" }}>{l.prenom}</div>
                      <div style={{ fontSize: 13, color: "#4B6358", marginBottom: 6 }}>{l.points} pt{l.points > 1 ? "s" : ""}</div>
                    </>
                  ) : <div style={{ height: 60 }} />}
                  <div style={{
                    width: "100%", height: socle, background: l ? fond : "#F1F5F2", borderRadius: "12px 12px 0 0",
                    display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 8,
                    fontFamily: POLICE_TITRE, fontWeight: 900, fontSize: 22, color: "white",
                  }}>
                    {l ? l.rang : ""}
                  </div>
                </div>
              );
            })}
          </div>

          <ol style={{ listStyle: "none", margin: "18px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {lignes.map((l: LigneClassement) => {
              const moi = l.cle === etat.moi;
              return (
                <li key={l.cle} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 14,
                  background: moi ? "#FEF3C7" : l.rang <= 3 ? VERT_CLAIR : "#F8FAF9",
                  border: moi ? "2px solid #F59E0B" : "2px solid transparent",
                }}>
                  <span style={{ width: 28, textAlign: "center", fontWeight: 900, color: VERT }}>{l.rang}</span>
                  <span style={{ flex: 1, fontWeight: moi ? 800 : 600 }}>{l.prenom}{moi ? " (toi)" : ""}</span>
                  <span style={{ fontSize: 12, color: "#4B6358" }}>{l.podcasts} 🎧</span>
                  <span style={{ fontWeight: 800, color: VERT, minWidth: 54, textAlign: "right" }}>{l.points} pt{l.points > 1 ? "s" : ""}</span>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}

function Encart({ titre, texte }: { titre: string; texte: string }) {
  return (
    <div style={{ background: "white", borderRadius: 24, padding: "28px 22px", textAlign: "center" }}>
      <h1 style={{ fontFamily: POLICE_TITRE, fontWeight: 800, color: VERT, fontSize: 24, margin: 0 }}>{titre}</h1>
      <p style={{ color: "#4B6358", marginTop: 10 }}>{texte}</p>
    </div>
  );
}

const STYLES = `
  @keyframes rallyeSortirDroite { to { transform: translateX(150%) rotate(12deg); opacity: 0; } }
  @keyframes rallyeSortirGauche { to { transform: translateX(-150%) rotate(-12deg); opacity: 0; } }
  @keyframes rallyeEntrer { from { transform: scale(0.94) translateY(16px); opacity: 0; } to { transform: none; opacity: 1; } }
  .rallye-sortir-droite { animation: rallyeSortirDroite 0.38s cubic-bezier(0.4,0,0.2,1) forwards; }
  .rallye-sortir-gauche { animation: rallyeSortirGauche 0.38s cubic-bezier(0.4,0,0.2,1) forwards; }
  .rallye-entrer { animation: rallyeEntrer 0.3s ease forwards; }
  .rallye-carte-fond {
    position: absolute; inset: 0; background: white; border-radius: 24px;
    transform-origin: bottom center; box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  }
  .rallye-choix { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  @media (max-width: 720px) { .rallye-choix { grid-template-columns: 1fr; } }
  .rallye-episode {
    background: white; border: 2px solid transparent; border-radius: 20px; overflow: hidden; padding: 0;
    cursor: pointer; font-family: inherit; box-shadow: 0 4px 20px rgba(14,59,46,0.10);
    transition: transform 0.15s ease, border-color 0.15s ease;
  }
  .rallye-episode:hover:not(:disabled) { transform: translateY(-3px); border-color: ${ROUGE}; }
  .rallye-btn {
    background: ${VERT}; color: white; border: none; border-radius: 999px; padding: 14px 28px;
    font-size: 16px; font-weight: 800; cursor: pointer; font-family: ${POLICE_TITRE};
  }
  .rallye-btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .rallye-btn-secondaire { background: ${VERT_CLAIR}; color: ${VERT}; }
  .rallye-podium { display: flex; align-items: flex-end; gap: 10px; margin-top: 18px; }
`;
