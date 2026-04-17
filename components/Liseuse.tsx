"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

type ThemeName = "blanc" | "sepia" | "sombre";
type SizeLevel = 0 | 1 | 2 | 3 | 4;

const THEMES: Record<ThemeName, {
  bg: string; surface: string; text: string; muted: string; border: string; shadow: string;
}> = {
  blanc: { bg: "#FFFFFF", surface: "#FFFFFF", text: "#1F2937", muted: "#6B7280", border: "#E5E7EB", shadow: "rgba(0,0,0,0.08)" },
  sepia: { bg: "#F5ECD9", surface: "#FBF3E0", text: "#4B3621", muted: "#8B7355", border: "#E0D2B5", shadow: "rgba(75,54,33,0.08)" },
  sombre: { bg: "#1A1A1A", surface: "#242424", text: "#E8E8E8", muted: "#9CA3AF", border: "#3A3A3A", shadow: "rgba(0,0,0,0.4)" },
};

const FONT_SIZES = [15, 16.5, 18, 20, 23];
const LINE_HEIGHTS = [1.65, 1.7, 1.75, 1.8, 1.85];
const COLUMN_GAP = 48;
const PADDING_X = 36;
const PADDING_Y = 28;

const PREFS_KEY = "liseuse_prefs_v1";
const pageKey = (id?: string | number) => `liseuse_page_${id}`;

interface Props {
  titre: string;
  texte: string;
  exerciceId?: string | number;
  onTermine?: () => void;
  actionLabel?: string;
  onClose?: () => void;
  height?: string;
}

export default function Liseuse({ titre, texte, exerciceId, onTermine, actionLabel, onClose, height }: Props) {
  const [theme, setTheme] = useState<ThemeName>("blanc");
  const [sizeLevel, setSizeLevel] = useState<SizeLevel>(2);
  const [page, setPage] = useState(0);
  const [nbPages, setNbPages] = useState(1);
  const [pageWidth, setPageWidth] = useState(0);
  const [ready, setReady] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Charger les préférences + dernière page
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { theme?: ThemeName; sizeLevel?: SizeLevel };
        if (p.theme && THEMES[p.theme]) setTheme(p.theme);
        if (typeof p.sizeLevel === "number" && p.sizeLevel >= 0 && p.sizeLevel <= 4) {
          setSizeLevel(p.sizeLevel as SizeLevel);
        }
      }
      if (exerciceId !== undefined) {
        const saved = localStorage.getItem(pageKey(exerciceId));
        if (saved) {
          const n = parseInt(saved, 10);
          if (!isNaN(n) && n >= 0) setPage(n);
        }
      }
    } catch {}
  }, [exerciceId]);

  // Sauver les préférences
  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ theme, sizeLevel })); } catch {}
  }, [theme, sizeLevel]);

  // Sauver la dernière page lue
  useEffect(() => {
    if (exerciceId === undefined || !ready) return;
    try { localStorage.setItem(pageKey(exerciceId), String(page)); } catch {}
  }, [page, exerciceId, ready]);

  // Mesurer la largeur utile (viewport - padding)
  useLayoutEffect(() => {
    const v = viewportRef.current;
    if (!v) return;
    const update = () => setPageWidth(Math.max(0, v.clientWidth - 2 * PADDING_X));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(v);
    return () => ro.disconnect();
  }, []);

  // Recalculer le nombre de pages
  const recomputePages = useCallback(() => {
    const c = contentRef.current;
    if (!c || pageWidth <= 0) return;
    const total = c.scrollWidth;
    const nb = Math.max(1, Math.round((total + COLUMN_GAP) / (pageWidth + COLUMN_GAP)));
    setNbPages(nb);
    setPage((p) => Math.min(p, nb - 1));
    setReady(true);
  }, [pageWidth]);

  useLayoutEffect(() => {
    const raf = requestAnimationFrame(recomputePages);
    return () => cancelAnimationFrame(raf);
  }, [recomputePages, sizeLevel, texte]);

  // Navigation clavier
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        setPage((p) => Math.min(nbPages - 1, p + 1));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setPage((p) => Math.max(0, p - 1));
      } else if (e.key === "Home") {
        setPage(0);
      } else if (e.key === "End") {
        setPage(nbPages - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nbPages]);

  // Navigation tactile (swipe)
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) setPage((p) => Math.max(0, p - 1));
      else setPage((p) => Math.min(nbPages - 1, p + 1));
    }
    touchStart.current = null;
  };

  const th = THEMES[theme];
  const fontSize = FONT_SIZES[sizeLevel];
  const lineHeight = LINE_HEIGHTS[sizeLevel];
  const canPrev = page > 0;
  const canNext = page < nbPages - 1;

  const paragraphes = React.useMemo(() => {
    return texte.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
  }, [texte]);

  const progressPct = nbPages > 1 ? Math.round((page / (nbPages - 1)) * 100) : 100;

  return (
    <div style={{
      background: th.bg, color: th.text,
      borderRadius: 18, overflow: "hidden",
      border: `1px solid ${th.border}`,
      boxShadow: `0 10px 30px ${th.shadow}`,
      transition: "background 0.25s, color 0.25s, border-color 0.25s",
    }}>
      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px",
        borderBottom: `1px solid ${th.border}`,
        background: th.surface, flexWrap: "wrap",
      }}>
        <span className="ms" style={{ fontSize: 20, color: "#7C3AED" }}>auto_stories</span>
        <div style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 15,
          flex: 1, minWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          color: th.text,
        }}>
          {titre}
        </div>

        {/* Taille */}
        <div style={{
          display: "flex", alignItems: "center", gap: 2,
          background: th.bg, borderRadius: 999, padding: 3,
          border: `1px solid ${th.border}`,
        }}>
          <button
            onClick={() => setSizeLevel((s) => Math.max(0, s - 1) as SizeLevel)}
            disabled={sizeLevel === 0}
            title="Réduire la police"
            style={iconBtnStyle(th, sizeLevel === 0)}
          >
            <span className="ms" style={{ fontSize: 18 }}>text_decrease</span>
          </button>
          <span style={{
            fontSize: 11, fontWeight: 800, color: th.muted,
            minWidth: 18, textAlign: "center",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}>
            {sizeLevel + 1}
          </span>
          <button
            onClick={() => setSizeLevel((s) => Math.min(4, s + 1) as SizeLevel)}
            disabled={sizeLevel === 4}
            title="Agrandir la police"
            style={iconBtnStyle(th, sizeLevel === 4)}
          >
            <span className="ms" style={{ fontSize: 18 }}>text_increase</span>
          </button>
        </div>

        {/* Thème */}
        <div style={{
          display: "flex", gap: 4,
          background: th.bg, borderRadius: 999, padding: 3,
          border: `1px solid ${th.border}`,
        }}>
          {(["blanc", "sepia", "sombre"] as ThemeName[]).map((t) => {
            const selected = theme === t;
            return (
              <button
                key={t}
                onClick={() => setTheme(t)}
                title={t === "blanc" ? "Clair" : t === "sepia" ? "Sépia" : "Sombre"}
                style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: THEMES[t].bg,
                  border: selected ? `2px solid #7C3AED` : `1px solid ${THEMES[t].border}`,
                  cursor: "pointer", padding: 0,
                  boxShadow: selected ? "0 0 0 2px rgba(124,58,237,0.2)" : "none",
                  transition: "all 0.15s",
                }}
                aria-label={`Thème ${t}`}
              />
            );
          })}
        </div>

        {onClose && (
          <button
            onClick={onClose}
            title="Fermer"
            style={{
              width: 32, height: 32, borderRadius: "50%",
              background: th.bg, border: `1px solid ${th.border}`,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              color: th.text,
            }}
          >
            <span className="ms" style={{ fontSize: 18 }}>close</span>
          </button>
        )}
      </div>

      {/* Viewport des pages */}
      <div
        ref={viewportRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{
          position: "relative",
          height: height ?? "min(70vh, 620px)",
          padding: `${PADDING_Y}px ${PADDING_X}px`,
          background: th.bg,
          overflow: "hidden",
          userSelect: "text",
        }}
      >
        <div
          ref={contentRef}
          style={{
            height: "100%",
            columnWidth: pageWidth > 0 ? `${pageWidth}px` : undefined,
            columnGap: `${COLUMN_GAP}px`,
            columnFill: "auto",
            fontFamily: "'Lora', 'Iowan Old Style', 'Georgia', 'Times New Roman', serif",
            fontSize,
            lineHeight,
            color: th.text,
            textAlign: "justify",
            hyphens: "auto",
            WebkitHyphens: "auto",
            transform: pageWidth > 0 ? `translateX(-${page * (pageWidth + COLUMN_GAP)}px)` : undefined,
            transition: ready ? "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)" : "none",
            opacity: ready ? 1 : 0,
          }}
        >
          {paragraphes.map((para, i) => (
            <p
              key={i}
              style={{
                margin: 0,
                marginBottom: "0.9em",
                textIndent: i === 0 ? 0 : "1.5em",
              }}
            >
              {para.split("\n").map((ligne, j, arr) => (
                <React.Fragment key={j}>
                  {ligne}
                  {j < arr.length - 1 && <br />}
                </React.Fragment>
              ))}
            </p>
          ))}
        </div>

        {/* Boutons nav */}
        {canPrev && (
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            aria-label="Page précédente"
            style={navBtnStyle(th, "left")}
          >
            <span className="ms" style={{ fontSize: 26 }}>chevron_left</span>
          </button>
        )}
        {canNext && (
          <button
            onClick={() => setPage((p) => Math.min(nbPages - 1, p + 1))}
            aria-label="Page suivante"
            style={navBtnStyle(th, "right")}
          >
            <span className="ms" style={{ fontSize: 26 }}>chevron_right</span>
          </button>
        )}
      </div>

      {/* Barre de progression */}
      <div style={{
        background: th.surface, borderTop: `1px solid ${th.border}`,
        padding: "10px 16px",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <span style={{
          fontSize: 12, fontWeight: 700, color: th.muted,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          minWidth: 72, whiteSpace: "nowrap",
        }}>
          Page {page + 1} / {nbPages}
        </span>
        <div
          onClick={(e) => {
            if (nbPages <= 1) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            const target = Math.round(pct * (nbPages - 1));
            setPage(Math.max(0, Math.min(nbPages - 1, target)));
          }}
          style={{
            flex: 1, height: 6, borderRadius: 999,
            background: th.border, overflow: "hidden",
            cursor: nbPages > 1 ? "pointer" : "default",
          }}
        >
          <div style={{
            height: "100%", background: "#7C3AED",
            width: `${progressPct}%`,
            transition: "width 0.3s",
          }} />
        </div>
        <span style={{
          fontSize: 12, fontWeight: 700, color: th.muted,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          minWidth: 36, textAlign: "right",
        }}>
          {progressPct}%
        </span>
      </div>

      {/* Footer action */}
      {onTermine && (
        <div style={{
          padding: "14px",
          background: th.surface,
          borderTop: `1px solid ${th.border}`,
          textAlign: "center",
        }}>
          <button
            onClick={onTermine}
            style={{
              padding: "12px 28px", borderRadius: 999,
              background: "#7C3AED", color: "white",
              fontWeight: 700, fontSize: 14, border: "none",
              cursor: "pointer",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              boxShadow: "0 4px 12px rgba(124,58,237,0.3)",
              display: "inline-flex", alignItems: "center", gap: 8,
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#6D28D9")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#7C3AED")}
          >
            <span className="ms" style={{ fontSize: 18 }}>check_circle</span>
            {actionLabel ?? "J'ai terminé la lecture"}
          </button>
        </div>
      )}
    </div>
  );
}

function iconBtnStyle(th: typeof THEMES.blanc, disabled: boolean): React.CSSProperties {
  return {
    width: 26, height: 26, borderRadius: "50%",
    background: "transparent", border: "none",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.4 : 1,
    display: "flex", alignItems: "center", justifyContent: "center",
    color: th.text, padding: 0,
  };
}

function navBtnStyle(th: typeof THEMES.blanc, side: "left" | "right"): React.CSSProperties {
  const base: React.CSSProperties = {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: 44, height: 44, borderRadius: "50%",
    background: th.surface, border: `1px solid ${th.border}`,
    cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: th.text,
    boxShadow: `0 3px 10px ${th.shadow}`,
    transition: "all 0.15s",
    zIndex: 2,
  };
  if (side === "left") base.left = 10;
  else base.right = 10;
  return base;
}
