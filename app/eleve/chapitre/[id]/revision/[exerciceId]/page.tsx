"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useEleveSession } from "@/hooks/useEleveSession";

interface RevisionContenu {
  texte: string;
  points_cles?: string[];
  video_url?: string;
}

export default function PageRevisionEleve() {
  const { id: chapitreId, exerciceId } = useParams<{ id: string; exerciceId: string }>();
  const router = useRouter();
  const { session, chargement: chargementSession } = useEleveSession();

  const [titre, setTitre] = useState("");
  const [contenu, setContenu] = useState<RevisionContenu | null>(null);
  const [chargement, setChargement] = useState(true);
  const [marquage, setMarquage] = useState(false);
  const [dejaLu, setDejaLu] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (chargementSession) return;
    if (!session) { router.push("/eleve"); return; }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    charger(ctrl.signal);

    return () => { ctrl.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargementSession, session, chapitreId, exerciceId]);

  async function charger(signal: AbortSignal) {
    setChargement(true);
    try {
      // Charger l'exercice (revision)
      const res = await fetch(`/api/chapitres/exercices?chapitre_id=${chapitreId}`, { signal });
      const json = await res.json();

      if (signal.aborted) return;

      const exo = (json.exercices ?? []).find((e: any) => e.id === exerciceId);
      if (!exo || exo.type !== "revision") {
        router.push(`/eleve/chapitre/${chapitreId}`);
        return;
      }

      setTitre(exo.titre);
      setContenu(exo.contenu as RevisionContenu);

      // Vérifier si déjà lu
      if (session) {
        const param = session.source === "planbox"
          ? `eleve_id=${session.id}`
          : `rb_eleve_id=${session.id}`;
        const progRes = await fetch(`/api/chapitres/progression?chapitre_id=${chapitreId}&${param}`, { signal });
        const progJson = await progRes.json();
        if (signal.aborted) return;
        const exoProg = (progJson.exercices ?? []).find((e: any) => e.exercice_id === exerciceId);
        if (exoProg?.valide) setDejaLu(true);
      }
    } catch (err) {
      if (signal.aborted) return;
      console.error("[charger revision]", err);
      router.push(`/eleve/chapitre/${chapitreId}`);
    } finally {
      if (!signal.aborted) setChargement(false);
    }
  }

  async function marquerLu() {
    if (!session || marquage) return;
    setMarquage(true);
    try {
      const body: Record<string, unknown> = { exercice_id: exerciceId };
      if (session.source === "planbox") body.eleve_id = session.id;
      else body.rb_eleve_id = session.id;

      await fetch("/api/chapitres/exercices/marquer-lu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      setDejaLu(true);
      // Petit délai pour le feedback visuel, puis retour
      setTimeout(() => {
        router.push(`/eleve/chapitre/${chapitreId}`);
      }, 600);
    } catch {
      setMarquage(false);
    }
  }

  // Extraire l'ID vidéo YouTube
  function getYoutubeEmbed(url: string): string | null {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : null;
  }

  if (chargement || chargementSession) {
    return (
      <div style={{ maxWidth: 700, margin: "40px auto", padding: "0 20px" }}>
        <div className="skeleton" style={{ height: 40, borderRadius: 12, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 200, borderRadius: 16, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 100, borderRadius: 16 }} />
      </div>
    );
  }

  if (!contenu) return null;

  const embedUrl = contenu.video_url ? getYoutubeEmbed(contenu.video_url) : null;

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "20px 20px 100px" }}>
      {/* Navigation */}
      <Link href={`/eleve/chapitre/${chapitreId}`} style={{
        fontSize: 13, color: "var(--pb-on-surface-variant)", textDecoration: "none",
        display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 16,
      }}>
        <span className="ms" style={{ fontSize: 18 }}>arrow_back</span> Retour au parcours
      </Link>

      {/* En-tête */}
      <div style={{
        background: "linear-gradient(135deg, #FFF7ED, #FFFBEB)",
        border: "2px solid #FDE68A",
        borderRadius: 20, padding: "20px 24px", marginBottom: 24,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 28 }}>📖</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#92400E" }}>
              Révision
            </div>
            <h1 style={{
              fontSize: 20, fontWeight: 800, margin: 0, color: "var(--pb-on-surface)",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}>
              {titre}
            </h1>
          </div>
        </div>
        {dejaLu && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700,
            background: "#D1FAE5", color: "#065F46", marginTop: 4,
          }}>
            <span className="ms" style={{ fontSize: 14 }}>check_circle</span> Déjà consultée
          </div>
        )}
      </div>

      {/* Vidéo */}
      {embedUrl && (
        <div style={{
          borderRadius: 16, overflow: "hidden", marginBottom: 24,
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
          aspectRatio: "16/9",
        }}>
          <iframe
            src={embedUrl}
            style={{ width: "100%", height: "100%", border: "none" }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Vidéo de révision"
          />
        </div>
      )}
      {contenu.video_url && !embedUrl && (
        <a href={contenu.video_url} target="_blank" rel="noopener noreferrer" style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "14px 18px", borderRadius: 14, marginBottom: 24,
          background: "#EFF6FF", border: "1px solid #BFDBFE",
          color: "#1E40AF", fontSize: 14, fontWeight: 600,
          textDecoration: "none",
        }}>
          <span className="ms" style={{ fontSize: 20 }}>play_circle</span>
          Voir la vidéo
          <span className="ms" style={{ fontSize: 16, marginLeft: "auto" }}>open_in_new</span>
        </a>
      )}

      {/* Contenu de la leçon */}
      <div style={{
        background: "white",
        border: "1px solid var(--pb-outline-variant, #e5e7eb)",
        borderRadius: 16, padding: "24px 28px", marginBottom: 24,
        fontSize: 15, lineHeight: 1.8,
        color: "var(--pb-on-surface)",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        <div
          dangerouslySetInnerHTML={{ __html: contenu.texte }}
          style={{ wordBreak: "break-word" }}
        />
      </div>

      {/* Points clés */}
      {contenu.points_cles && contenu.points_cles.length > 0 && (
        <div style={{
          background: "linear-gradient(135deg, #EFF6FF, #F0FDF4)",
          border: "1.5px solid #93C5FD",
          borderRadius: 16, padding: "18px 22px", marginBottom: 24,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span className="ms" style={{ fontSize: 20, color: "#2563EB" }}>lightbulb</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#1E40AF", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              À retenir
            </span>
          </div>
          <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
            {contenu.points_cles.map((pt, i) => (
              <li key={i} style={{ fontSize: 14, fontWeight: 600, color: "var(--pb-on-surface)", lineHeight: 1.5 }}>
                {pt}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Bouton marquer comme lu */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "16px 20px", background: "white", borderTop: "1px solid var(--pb-outline-variant, #e5e7eb)", zIndex: 10 }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          {dejaLu ? (
            <button
              onClick={() => router.push(`/eleve/chapitre/${chapitreId}`)}
              style={{
                width: "100%", padding: "14px 20px", borderRadius: 14,
                background: "#22C55E", color: "white",
                fontSize: 15, fontWeight: 800, border: "none", cursor: "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              <span className="ms" style={{ fontSize: 20 }}>check_circle</span>
              Continuer le parcours
            </button>
          ) : (
            <button
              onClick={marquerLu}
              disabled={marquage}
              style={{
                width: "100%", padding: "14px 20px", borderRadius: 14,
                background: marquage ? "#9CA3AF" : "#F59E0B", color: "white",
                fontSize: 15, fontWeight: 800, border: "none", cursor: "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "background 0.2s",
              }}
            >
              {marquage ? (
                <>⏳ Enregistrement...</>
              ) : (
                <>
                  <span className="ms" style={{ fontSize: 20 }}>menu_book</span>
                  J&apos;ai lu cette leçon ✓
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
