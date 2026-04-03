"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";

interface Item {
  texte: string;
  categorie: string;
}

interface Props {
  titre: string;
  consigne: string;
  categories: string[];
  items: Item[];
  onTermine: (score: { bon: number; total: number }, reponsesEleve: { id: number; reponse: string; correcte: boolean | null }[]) => void;
}

const COULEURS_CATEGORIES = [
  { bg: "rgba(37,99,235,0.08)", border: "rgba(37,99,235,0.3)", text: "#2563EB", headerBg: "rgba(37,99,235,0.15)" },
  { bg: "rgba(220,38,38,0.08)", border: "rgba(220,38,38,0.3)", text: "#DC2626", headerBg: "rgba(220,38,38,0.15)" },
  { bg: "rgba(22,163,74,0.08)", border: "rgba(22,163,74,0.3)", text: "#16A34A", headerBg: "rgba(22,163,74,0.15)" },
  { bg: "rgba(217,119,6,0.08)", border: "rgba(217,119,6,0.3)", text: "#D97706", headerBg: "rgba(217,119,6,0.15)" },
  { bg: "rgba(124,58,237,0.08)", border: "rgba(124,58,237,0.3)", text: "#7C3AED", headerBg: "rgba(124,58,237,0.15)" },
  { bg: "rgba(14,116,144,0.08)", border: "rgba(14,116,144,0.3)", text: "#0E7490", headerBg: "rgba(14,116,144,0.15)" },
];

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type ItemWithId = Item & { id: number };

export default function ClassementEleve({ titre, consigne, categories, items, onTermine }: Props) {
  const [itemsRestants, setItemsRestants] = useState<ItemWithId[]>(
    () => shuffleArray(items.map((item, i) => ({ ...item, id: i })))
  );
  const [classement, setClassement] = useState<Record<string, ItemWithId[]>>(
    () => Object.fromEntries(categories.map((c) => [c, []]))
  );
  const [draggedItem, setDraggedItem] = useState<ItemWithId | null>(null);
  const [dragSource, setDragSource] = useState<string | null>(null);
  const [dragOverCat, setDragOverCat] = useState<string | null>(null);
  const [dragOverPool, setDragOverPool] = useState(false);
  const [etat, setEtat] = useState<"classement" | "resultat" | "termine">("classement");
  const [erreurs, setErreurs] = useState<Set<number>>(new Set());
  const [score, setScore] = useState({ bon: 0, total: 0 });

  // Touch drag state
  const touchDragRef = useRef<{
    item: ItemWithId;
    source: string | null;
    ghostEl: HTMLDivElement | null;
    startX: number;
    startY: number;
    isDragging: boolean;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalClasses = Object.values(classement).reduce((s, arr) => s + arr.length, 0);
  const tousClasses = itemsRestants.length === 0;

  // --- Drop dans une catégorie ---
  function handleDropInCat(categorie: string, item?: ItemWithId, source?: string | null) {
    const droppedItem = item || draggedItem;
    const droppedSource = source !== undefined ? source : dragSource;
    if (!droppedItem) return;
    setDragOverCat(null);

    // Ignorer si on drop dans la même catégorie
    if (droppedSource === categorie) {
      setDraggedItem(null);
      setDragSource(null);
      return;
    }

    if (droppedSource) {
      setClassement((prev) => ({
        ...prev,
        [droppedSource]: prev[droppedSource].filter((i) => i.id !== droppedItem.id),
        [categorie]: [...prev[categorie], droppedItem],
      }));
    } else {
      setClassement((prev) => ({
        ...prev,
        [categorie]: [...prev[categorie], droppedItem],
      }));
      setItemsRestants((prev) => prev.filter((i) => i.id !== droppedItem.id));
    }

    setErreurs((prev) => {
      const next = new Set(prev);
      next.delete(droppedItem.id);
      return next;
    });

    setDraggedItem(null);
    setDragSource(null);
  }

  // --- Drop dans le pool ---
  function handleDropInPool(item?: ItemWithId, source?: string | null) {
    const droppedItem = item || draggedItem;
    const droppedSource = source !== undefined ? source : dragSource;
    if (!droppedItem || !droppedSource) return;
    setDragOverPool(false);

    setClassement((prev) => ({
      ...prev,
      [droppedSource]: prev[droppedSource].filter((i) => i.id !== droppedItem.id),
    }));
    setItemsRestants((prev) => [...prev, droppedItem]);

    setErreurs((prev) => {
      const next = new Set(prev);
      next.delete(droppedItem.id);
      return next;
    });

    setDraggedItem(null);
    setDragSource(null);
  }

  // --- Touch: Détection zone sous le doigt ---
  const getDropTarget = useCallback((x: number, y: number): { type: "category"; name: string } | { type: "pool" } | null => {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const catEl = el.closest("[data-category]") as HTMLElement | null;
    if (catEl) return { type: "category", name: catEl.dataset.category! };
    const poolEl = el.closest("[data-pool]") as HTMLElement | null;
    if (poolEl) return { type: "pool" };
    return null;
  }, []);

  // --- Touch Start ---
  const handleTouchStart = useCallback((e: React.TouchEvent, item: ItemWithId, source: string | null) => {
    if (etat !== "classement") return;
    const touch = e.touches[0];

    // Créer le ghost
    const ghost = document.createElement("div");
    ghost.textContent = item.texte;
    ghost.style.cssText = `
      position: fixed;
      z-index: 9999;
      padding: 8px 16px;
      border-radius: 10px;
      background: white;
      border: 2px solid #0369A1;
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
      font-size: 0.9375rem;
      font-weight: 600;
      color: #0369A1;
      pointer-events: none;
      transform: translate(-50%, -50%) scale(1.05);
      transition: transform 0.1s;
      max-width: 200px;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    ghost.style.left = `${touch.clientX}px`;
    ghost.style.top = `${touch.clientY}px`;
    document.body.appendChild(ghost);

    touchDragRef.current = {
      item,
      source,
      ghostEl: ghost,
      startX: touch.clientX,
      startY: touch.clientY,
      isDragging: false,
    };
  }, [etat]);

  // --- Touch Move (global via useEffect) ---
  useEffect(() => {
    function onTouchMove(e: TouchEvent) {
      const ref = touchDragRef.current;
      if (!ref) return;

      const touch = e.touches[0];
      const dx = touch.clientX - ref.startX;
      const dy = touch.clientY - ref.startY;

      // Seuil de 8px pour déclencher le drag (éviter les taps accidentels)
      if (!ref.isDragging && Math.abs(dx) < 8 && Math.abs(dy) < 8) return;

      ref.isDragging = true;
      e.preventDefault(); // Empêcher le scroll

      // Déplacer le ghost
      if (ref.ghostEl) {
        ref.ghostEl.style.left = `${touch.clientX}px`;
        ref.ghostEl.style.top = `${touch.clientY}px`;
      }

      // Highlight de la zone survolée
      // On cache temporairement le ghost pour que elementFromPoint trouve la zone en dessous
      if (ref.ghostEl) ref.ghostEl.style.display = "none";
      const target = getDropTarget(touch.clientX, touch.clientY);
      if (ref.ghostEl) ref.ghostEl.style.display = "";

      if (target?.type === "category") {
        setDragOverCat(target.name);
        setDragOverPool(false);
      } else if (target?.type === "pool") {
        setDragOverCat(null);
        setDragOverPool(true);
      } else {
        setDragOverCat(null);
        setDragOverPool(false);
      }
    }

    function onTouchEnd(e: TouchEvent) {
      const ref = touchDragRef.current;
      if (!ref) return;

      // Supprimer le ghost
      if (ref.ghostEl) {
        ref.ghostEl.remove();
      }

      if (ref.isDragging) {
        const touch = e.changedTouches[0];
        const target = getDropTarget(touch.clientX, touch.clientY);

        if (target?.type === "category") {
          handleDropInCat(target.name, ref.item, ref.source);
        } else if (target?.type === "pool" && ref.source) {
          handleDropInPool(ref.item, ref.source);
        }
      }

      // Reset
      setDragOverCat(null);
      setDragOverPool(false);
      setDraggedItem(null);
      setDragSource(null);
      touchDragRef.current = null;
    }

    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", onTouchEnd);

    return () => {
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getDropTarget, classement, itemsRestants]);

  // --- Valider ---
  function valider() {
    const errs = new Set<number>();
    const log: { id: number; reponse: string; correcte: boolean }[] = [];
    let bon = 0;

    for (const [cat, catItems] of Object.entries(classement)) {
      for (const item of catItems) {
        const correct = item.categorie === cat;
        log.push({ id: item.id + 1, reponse: `"${item.texte}" → ${cat}`, correcte: correct });
        if (correct) {
          bon++;
        } else {
          errs.add(item.id);
        }
      }
    }

    setScore({ bon, total: items.length });

    if (errs.size === 0) {
      setEtat("termine");
      onTermine({ bon, total: items.length }, log);
    } else {
      setErreurs(errs);
      setEtat("resultat");

      setTimeout(() => {
        const itemsFaux: ItemWithId[] = [];
        const newClassement: Record<string, ItemWithId[]> = {};

        for (const [cat, catItems] of Object.entries(classement)) {
          newClassement[cat] = [];
          for (const item of catItems) {
            if (errs.has(item.id)) {
              itemsFaux.push(item);
            } else {
              newClassement[cat].push(item);
            }
          }
        }

        setClassement(newClassement);
        setItemsRestants(shuffleArray(itemsFaux));
        setEtat("classement");
        setErreurs(new Set());
      }, 3000);
    }
  }

  // --- Écran terminé ---
  if (etat === "termine") {
    const pct = score.total > 0 ? Math.round((score.bon / score.total) * 100) : 0;
    return (
      <div style={{ padding: "2rem 0", textAlign: "center" }}>
        <span className="ms" style={{ fontSize: 56, color: pct >= 80 ? "#16A34A" : "#D97706" }}>
          {pct >= 80 ? "emoji_events" : "sentiment_neutral"}
        </span>
        <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: "1.5rem", marginTop: 12 }}>
          Classement terminé !
        </h2>
        <p style={{ fontSize: "1.125rem", fontWeight: 700, color: pct >= 80 ? "#16A34A" : "#D97706", marginTop: 8 }}>
          Score : {score.bon} / {items.length} ({pct}%)
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ padding: "1rem 0", touchAction: "pan-y" }}>
      {/* Consigne */}
      <div style={{
        background: "rgba(3,105,161,0.06)", border: "1px solid rgba(3,105,161,0.15)",
        borderRadius: 14, padding: "0.875rem 1.25rem", marginBottom: 20,
        display: "flex", alignItems: "flex-start", gap: 10,
      }}>
        <span className="ms" style={{ fontSize: 20, color: "#0369A1", flexShrink: 0, marginTop: 2 }}>info</span>
        <p style={{ fontSize: "0.9375rem", color: "var(--text)", lineHeight: 1.5, margin: 0 }}>{consigne}</p>
      </div>

      {/* Feedback après validation */}
      {etat === "resultat" && (
        <div style={{
          marginBottom: 16, padding: "1rem 1.25rem", borderRadius: 12, textAlign: "center",
          background: score.bon === items.length ? "#DCFCE7" : "#FEF3C7",
          border: score.bon === items.length ? "1px solid #BBF7D0" : "1px solid #FDE68A",
        }}>
          <p style={{ fontWeight: 700, fontSize: "1rem", color: score.bon === items.length ? "#16A34A" : "#92400E", margin: 0 }}>
            {score.bon} / {items.length} bien classés
          </p>
          {erreurs.size > 0 && (
            <p style={{ fontSize: "0.8125rem", color: "#92400E", marginTop: 4 }}>
              Les éléments en rouge vont revenir — reclasse-les dans la bonne catégorie !
            </p>
          )}
        </div>
      )}

      {/* Progression */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)" }}>
          {totalClasses} / {items.length} classés
        </span>
        <div style={{ flex: 1, maxWidth: 200, height: 6, background: "var(--border)", borderRadius: 999, marginLeft: 12 }}>
          <div style={{
            height: "100%", borderRadius: 999, background: "#0369A1",
            width: `${(totalClasses / items.length) * 100}%`,
            transition: "width 0.3s",
          }} />
        </div>
      </div>

      {/* Catégories (zones de drop) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.min(categories.length, 4)}, 1fr)`,
        gap: 10, marginBottom: 20,
      }}>
        {categories.map((cat, ci) => {
          const c = COULEURS_CATEGORIES[ci % COULEURS_CATEGORIES.length];
          const isOver = dragOverCat === cat;
          return (
            <div
              key={cat}
              data-category={cat}
              onDragOver={(e) => { e.preventDefault(); setDragOverCat(cat); }}
              onDragLeave={() => setDragOverCat(null)}
              onDrop={(e) => { e.preventDefault(); handleDropInCat(cat); }}
              style={{
                borderRadius: 14,
                border: `2px ${isOver ? "solid" : "dashed"} ${c.border}`,
                background: isOver ? c.headerBg : c.bg,
                minHeight: 120,
                transition: "all 0.2s",
                transform: isOver ? "scale(1.02)" : "none",
              }}
            >
              {/* Header catégorie */}
              <div style={{
                padding: "8px 12px", borderRadius: "12px 12px 0 0",
                background: c.headerBg,
                fontWeight: 700, fontSize: "0.75rem", color: c.text,
                textAlign: "center", textTransform: "uppercase", letterSpacing: "0.05em",
              }}>
                {cat}
                {classement[cat].length > 0 && (
                  <span style={{ marginLeft: 6, opacity: 0.6 }}>({classement[cat].length})</span>
                )}
              </div>
              {/* Items classés */}
              <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 4, minHeight: 60 }}>
                {classement[cat]?.map((item) => {
                  const isErr = erreurs.has(item.id);
                  return (
                    <div
                      key={item.id}
                      draggable={etat === "classement"}
                      onDragStart={() => { setDraggedItem(item); setDragSource(cat); }}
                      onDragEnd={() => { setDraggedItem(null); setDragSource(null); setDragOverCat(null); setDragOverPool(false); }}
                      onTouchStart={(e) => handleTouchStart(e, item, cat)}
                      style={{
                        padding: "6px 10px", borderRadius: 8,
                        background: isErr ? "#FEE2E2" : "white",
                        border: isErr ? "2px solid #FCA5A5" : `1px solid ${c.border}`,
                        fontSize: "0.8125rem", fontWeight: 500,
                        color: isErr ? "#DC2626" : c.text,
                        cursor: etat === "classement" ? "grab" : "default",
                        animation: "fadeIn 0.3s ease",
                        transition: "all 0.3s",
                        touchAction: "none",
                      }}
                    >
                      {isErr && <span className="ms" style={{ fontSize: 14, marginRight: 4, verticalAlign: "middle" }}>close</span>}
                      {item.texte}
                    </div>
                  );
                })}
                {classement[cat]?.length === 0 && !isOver && (
                  <div style={{ padding: "16px 8px", textAlign: "center", fontSize: "0.6875rem", color: c.text, opacity: 0.5 }}>
                    Glisse ici
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Items à classer (pool / source du drag) */}
      {itemsRestants.length > 0 && (
        <div
          data-pool="true"
          onDragOver={(e) => { e.preventDefault(); setDragOverPool(true); }}
          onDragLeave={() => setDragOverPool(false)}
          onDrop={(e) => { e.preventDefault(); handleDropInPool(); }}
          style={{
            display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center",
            padding: "16px",
            background: dragOverPool ? "rgba(3,105,161,0.08)" : "rgba(0,0,0,0.02)",
            borderRadius: 14,
            border: dragOverPool ? "2px solid #0369A1" : "1px dashed var(--border)",
            transition: "all 0.2s",
            marginBottom: 16,
          }}
        >
          {itemsRestants.map((item) => (
            <div
              key={item.id}
              draggable={etat === "classement"}
              onDragStart={() => { setDraggedItem(item); setDragSource(null); }}
              onDragEnd={() => { setDraggedItem(null); setDragSource(null); setDragOverCat(null); setDragOverPool(false); }}
              onTouchStart={(e) => handleTouchStart(e, item, null)}
              style={{
                padding: "8px 16px", borderRadius: 10,
                background: draggedItem?.id === item.id ? "rgba(3,105,161,0.15)" : "white",
                border: draggedItem?.id === item.id ? "2px solid #0369A1" : "1.5px solid var(--border)",
                fontSize: "0.9375rem", fontWeight: 600, color: "var(--text)",
                cursor: "grab", userSelect: "none",
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                transition: "all 0.15s",
                opacity: draggedItem?.id === item.id ? 0.6 : 1,
                touchAction: "none",
              }}
            >
              {item.texte}
            </div>
          ))}
        </div>
      )}

      {/* Bouton Valider */}
      {tousClasses && etat === "classement" && (
        <button
          onClick={valider}
          style={{
            width: "100%", padding: "14px 24px", borderRadius: 999,
            background: "#0369A1", color: "white", fontWeight: 700,
            fontSize: "1rem", border: "none", cursor: "pointer",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            boxShadow: "0 4px 12px rgba(3,105,161,0.3)",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#075985")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#0369A1")}
        >
          <span className="ms" style={{ fontSize: 18, verticalAlign: "middle", marginRight: 8 }}>check_circle</span>
          Valider mon classement
        </button>
      )}

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
