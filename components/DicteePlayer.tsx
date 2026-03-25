"use client";

import { useRef, useState, useEffect } from "react";
import { PhraseDict } from "@/types";

interface Props {
  phrases: PhraseDict[];
  audioCompletUrl?: string | null;
  audioPhraseUrls?: { id: number; url: string | null }[];
  onTermine: () => void;
}

export default function DicteePlayer({ phrases, audioCompletUrl, audioPhraseUrls, onTermine }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [mode, setMode] = useState<"continu" | "phrase">("phrase");
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [aEcoute, setAEcoute] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [termine, setTermine] = useState(false);

  useEffect(() => {
    return () => { audioRef.current?.pause(); };
  }, []);

  function srcPhrase(idx: number): string | undefined {
    const phrase = phrases[idx];
    if (!phrase) return undefined;
    return audioPhraseUrls?.find((p) => p.id === phrase.id)?.url ?? undefined;
  }

  function jouerPhrase() {
    const src = srcPhrase(phraseIdx);
    if (!src || !audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.src = src;
    audioRef.current.load();
    audioRef.current.onended = () => { setEnCours(false); setAEcoute(true); };
    audioRef.current.play().then(() => setEnCours(true)).catch(() => setEnCours(false));
  }

  function jouerTout() {
    if (!audioCompletUrl || !audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.src = audioCompletUrl;
    audioRef.current.load();
    audioRef.current.onended = () => { setEnCours(false); setTermine(true); onTermine(); };
    audioRef.current.play().then(() => setEnCours(true)).catch(() => setEnCours(false));
  }

  function arreter() { audioRef.current?.pause(); setEnCours(false); }

  function phrasesuivante() {
    arreter();
    if (phraseIdx < phrases.length - 1) { setPhraseIdx((i) => i + 1); setAEcoute(false); }
    else { setTermine(true); onTermine(); }
  }

  function phrasePrec() {
    arreter();
    if (phraseIdx > 0) { setPhraseIdx((i) => i - 1); setAEcoute(false); }
  }

  function recommencer() { arreter(); setPhraseIdx(0); setAEcoute(false); setTermine(false); }

  function changerMode(m: "continu" | "phrase") { arreter(); setMode(m); }

  const pasDAudio = !audioCompletUrl && (!audioPhraseUrls || audioPhraseUrls.length === 0);

  // ── Pas d'audio ──
  if (pasDAudio) {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--pb-on-surface-variant)" }}>
        <span className="ms" style={{ fontSize: 48, display: "block", marginBottom: 12, opacity: 0.5 }}>mic_off</span>
        <p style={{ fontWeight: 600, marginBottom: 4 }}>Audio non disponible</p>
        <p style={{ fontSize: 13 }}>L&apos;enseignant doit générer l&apos;audio depuis la bibliothèque des dictées.</p>
      </div>
    );
  }

  // ── Terminé ──
  if (termine) {
    return (
      <div style={{ textAlign: "center", padding: "48px 20px" }}>
        <span className="ms" style={{ fontSize: 56, display: "block", marginBottom: 16, color: "#16A34A" }}>check_circle</span>
        <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 22, fontWeight: 800, marginBottom: 8, color: "var(--pb-on-surface)" }}>
          Dictée terminée !
        </h2>
        <p style={{ color: "var(--pb-on-surface-variant)", marginBottom: 24, fontSize: 15 }}>
          Relis bien ta dictée sur ton cahier avant de rendre.
        </p>
        <button
          onClick={recommencer}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14,
            fontWeight: 700, padding: "10px 24px", borderRadius: 999,
            background: "var(--pb-surface-container)", border: "none",
            color: "var(--pb-on-surface)", cursor: "pointer",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          <span className="ms" style={{ fontSize: 18 }}>replay</span>
          Réécouter depuis le début
        </button>
      </div>
    );
  }

  // ── Lecteur principal ──
  const progress = mode === "phrase"
    ? ((phraseIdx + (aEcoute ? 1 : 0)) / phrases.length) * 100
    : 0;

  return (
    <div>
      <audio ref={audioRef} />

      {/* ── Bloc audio bleu ── */}
      <div style={{
        background: "linear-gradient(135deg, var(--pb-primary), var(--pb-primary-dim, #0046bb))",
        borderRadius: "2rem", padding: "2rem 2.5rem", color: "white",
        boxShadow: "0 8px 32px rgba(0,80,212,0.18)",
        marginBottom: 24,
      }}>
        {/* Header avec icône */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: "rgba(255,255,255,0.2)", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span className="ms" style={{ fontSize: 28, color: "white" }}>graphic_eq</span>
          </div>
          <div>
            <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 20, fontWeight: 700, margin: 0, color: "white" }}>
              {mode === "phrase" ? "Phrase par phrase" : "Écoute complète"}
            </h3>
            <p style={{ fontSize: 14, margin: 0, opacity: 0.75, color: "white" }}>
              {mode === "phrase"
                ? `Phrase ${phraseIdx + 1} sur ${phrases.length}`
                : "Écoute la dictée et écris sur ton cahier"
              }
            </p>
          </div>
        </div>

        {/* Barre de progression (mode phrase) */}
        {mode === "phrase" && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ height: 6, background: "rgba(255,255,255,0.2)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{
                height: "100%", background: "white", borderRadius: 3,
                width: `${progress}%`, transition: "width 0.3s ease",
              }} />
            </div>
          </div>
        )}

        {/* Contrôles */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 24 }}>
          {mode === "phrase" && (
            <button
              onClick={phrasePrec}
              disabled={phraseIdx === 0}
              style={{
                width: 40, height: 40, borderRadius: "50%", border: "none",
                background: "transparent", color: "white", cursor: phraseIdx === 0 ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: phraseIdx === 0 ? 0.3 : 1, transition: "opacity 0.2s",
              }}
            >
              <span className="ms" style={{ fontSize: 24 }}>skip_previous</span>
            </button>
          )}

          <button
            onClick={enCours ? arreter : (mode === "phrase" ? jouerPhrase : jouerTout)}
            style={{
              width: 64, height: 64, borderRadius: "50%",
              background: "white", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
              transition: "transform 0.1s",
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.95)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            <span className="ms" style={{ fontSize: 36, color: "var(--pb-primary)" }}>
              {enCours ? "stop" : "play_arrow"}
            </span>
          </button>

          {mode === "phrase" && (
            <button
              onClick={phrasesuivante}
              disabled={!aEcoute}
              style={{
                width: 40, height: 40, borderRadius: "50%", border: "none",
                background: "transparent", color: "white", cursor: !aEcoute ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: !aEcoute ? 0.3 : 1, transition: "opacity 0.2s",
              }}
            >
              <span className="ms" style={{ fontSize: 24 }}>
                {phraseIdx < phrases.length - 1 ? "skip_next" : "check_circle"}
              </span>
            </button>
          )}
        </div>

        {/* Label état */}
        <p style={{ textAlign: "center", fontSize: 13, marginTop: 16, opacity: 0.7, color: "white" }}>
          {enCours
            ? "Lecture en cours…"
            : mode === "phrase"
              ? (aEcoute ? "Appuie sur suivant ou réécoute" : "Appuie sur lecture")
              : "Appuie pour écouter"
          }
        </p>
      </div>

      {/* ── Toggle mode ── */}
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        {(["phrase", "continu"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => changerMode(m)}
            style={{
              padding: "8px 20px", borderRadius: 999, fontSize: 13, cursor: "pointer",
              fontWeight: mode === m ? 700 : 500,
              background: mode === m ? "var(--pb-primary)" : "var(--pb-surface-container)",
              color: mode === m ? "white" : "var(--pb-on-surface-variant)",
              border: "none",
              display: "inline-flex", alignItems: "center", gap: 6,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              transition: "all 0.2s",
            }}
          >
            <span className="ms" style={{ fontSize: 16 }}>{m === "phrase" ? "format_list_numbered" : "play_circle"}</span>
            {m === "phrase" ? "Phrase par phrase" : "Mode continu"}
          </button>
        ))}
      </div>
    </div>
  );
}
