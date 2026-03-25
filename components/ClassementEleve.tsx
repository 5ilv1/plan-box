"use client";

import React, { useState, useRef } from "react";

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
  const [dragSource, setDragSource] = useState<string | null>(null); // null = from pool, string = from category
  const [dragOverCat, setDragOverCat] = useState<string | null>(null);
  const [dragOverPool, setDragOverPool] = useState(false);
  const [etat, setEtat] = useState<"classement" | "resultat" | "termine">("classement");
  const [erreurs, setErreurs] = useState<Set<number>>(new Set());
  const [score, setScore] = useState({ bon: 0, total: 0 });
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const totalClasses = Object.values(classement).reduce((s, arr) => s + arr.length, 0);
  const tousClasses = itemsRestants.length === 0;

  // --- Drop dans une catégorie ---
  function handleDropInCat(categorie: string) {
    if (!draggedItem) return;
    setDragOverCat(null);

    if (dragSource) {
      // Déplacer d'une catégorie à une autre
      setClassement((prev) => ({
        ...prev,
        [dragSource]: prev[dragSource].filter((i) => i.id !== draggedItem.id),
        [categorie]: [...prev[categorie], draggedItem],
      }));
    } else {
      // Déplacer du pool vers une catégorie
      setClassement((prev) => ({
        ...prev,
        [categorie]: [...prev[categorie], draggedItem],
      }));
      setItemsRestants((prev) => prev.filter((i) => i.id !== draggedItem.id));
    }

    // Retirer de la liste d'erreurs si présent
    setErreurs((prev) => {
      const next = new Set(prev);
      next.delete(draggedItem.id);
      return next;
    });

    setDraggedItem(null);
    setDragSource(null);
  }

  // --- Drop dans le pool (retrait d'une catégorie) ---
  function handleDropInPool() {
    if (!draggedItem || !dragSource) return;
    setDragOverPool(false);

    setClassement((prev) => ({
      ...prev,
      [dragSource]: prev[dragSource].filter((i) => i.id !== draggedItem.id),
    }));
    setItemsRestants((prev) => [...prev, draggedItem]);

    setErreurs((prev) => {
      const next = new Set(prev);
      next.delete(draggedItem.id);
      return next;
    });

    setDraggedItem(null);
    setDragSource(null);
  }

  // --- Touch events ---
  function handleTouchStart(e: React.TouchEvent, item: ItemWithId, source: string | null) {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    setDraggedItem(item);
    setDragSource(source);
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!draggedItem) return;
    const touch = e.changedTouches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const catEl = el?.closest("[data-category]") as HTMLElement | null;
    const poolEl = el?.closest("[data-pool]") as HTMLElement | null;
    if (catEl) {
      handleDropInCat(catEl.dataset.category!);
    } else if (poolEl) {
      handleDropInPool();
    } else {
      setDraggedItem(null);
      setDragSource(null);
    }
    touchStartRef.current = null;
  }

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
      // Tout est correct !
      setEtat("termine");
      onTermine({ bon, total: items.length }, log);
    } else {
      // Il y a des erreurs → les remettre dans le pool
      setErreurs(errs);
      setEtat("resultat");

      setTimeout(() => {
        // Remettre les items faux dans le pool
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
    <div style={{ padding: "1rem 0" }}>
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
                      onTouchStart={(e) => etat === "classement" && handleTouchStart(e, item, cat)}
                      onTouchEnd={handleTouchEnd}
                      style={{
                        padding: "6px 10px", borderRadius: 8,
                        background: isErr ? "#FEE2E2" : "white",
                        border: isErr ? "2px solid #FCA5A5" : `1px solid ${c.border}`,
                        fontSize: "0.8125rem", fontWeight: 500,
                        color: isErr ? "#DC2626" : c.text,
                        cursor: etat === "classement" ? "grab" : "default",
                        animation: "fadeIn 0.3s ease",
                        transition: "all 0.3s",
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
              onTouchStart={(e) => etat === "classement" && handleTouchStart(e, item, null)}
              onTouchEnd={handleTouchEnd}
              style={{
                padding: "8px 16px", borderRadius: 10,
                background: draggedItem?.id === item.id ? "rgba(3,105,161,0.15)" : "white",
                border: draggedItem?.id === item.id ? "2px solid #0369A1" : "1.5px solid var(--border)",
                fontSize: "0.9375rem", fontWeight: 600, color: "var(--text)",
                cursor: "grab", userSelect: "none",
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                transition: "all 0.15s",
                opacity: draggedItem?.id === item.id ? 0.6 : 1,
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
