"use client";

import type { ReactNode } from "react";
import { AXE, CADRE_INFOBULLE, ENCRE, ENCRE_DOUCE, POLICE } from "./theme-charts";

/** Le contenant commun de tous les blocs du suivi. */
export function Carte({
  titre,
  sousTitre,
  action,
  children,
  plein,
}: {
  titre: string;
  sousTitre?: string;
  action?: ReactNode;
  children: ReactNode;
  plein?: boolean;
}) {
  return (
    <section
      style={{
        background: "var(--pb-surface-lowest)",
        borderRadius: 20,
        padding: plein ? 0 : 20,
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        border: "1px solid var(--pb-outline-variant)",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          padding: plein ? "20px 20px 0" : 0,
          marginBottom: 16,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: ENCRE, fontFamily: POLICE }}>
            {titre}
          </h3>
          {sousTitre && (
            <p style={{ margin: "3px 0 0", fontSize: 12, color: ENCRE_DOUCE }}>{sousTitre}</p>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Ce que l'on affiche quand il n'y a rien à montrer — jamais un graphe vide. */
export function EtatVide({ message }: { message: string }) {
  return (
    <p
      style={{
        margin: 0,
        padding: "28px 8px",
        textAlign: "center",
        fontSize: 13,
        color: ENCRE_DOUCE,
      }}
    >
      {message}
    </p>
  );
}

/** Infobulle commune : un titre, puis une ligne par valeur. */
export function Infobulle({
  titre,
  lignes,
}: {
  titre: string;
  lignes: Array<{ libelle: string; valeur: string; couleur?: string }>;
}) {
  return (
    <div style={CADRE_INFOBULLE}>
      <p style={{ margin: "0 0 6px", fontWeight: 700 }}>{titre}</p>
      {lignes.map((l) => (
        <p
          key={l.libelle}
          style={{ margin: "2px 0", display: "flex", alignItems: "center", gap: 6 }}
        >
          {l.couleur && (
            <span
              style={{
                width: 8, height: 8, borderRadius: 2,
                background: l.couleur, flexShrink: 0,
              }}
            />
          )}
          <span style={{ color: ENCRE_DOUCE }}>{l.libelle}</span>
          <strong style={{ marginLeft: "auto", paddingLeft: 12 }}>{l.valeur}</strong>
        </p>
      ))}
    </div>
  );
}

/** Légende : l'identité ne repose jamais sur la seule couleur. */
export function Legende({ items }: { items: Array<{ libelle: string; couleur: string }> }) {
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 4 }}>
      {items.map((i) => (
        <span
          key={i.libelle}
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: ENCRE_DOUCE }}
        >
          <span style={{ width: 10, height: 10, borderRadius: 3, background: i.couleur }} />
          {i.libelle}
        </span>
      ))}
    </div>
  );
}

/** Repli de la liste des blocs détaillés. */
export function Repliable({
  titre,
  sousTitre,
  ouvertParDefaut,
  children,
}: {
  titre: string;
  sousTitre?: string;
  ouvertParDefaut?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={ouvertParDefaut}
      style={{
        background: "var(--pb-surface-lowest)",
        borderRadius: 20,
        border: `1px solid var(--pb-outline-variant)`,
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        overflow: "hidden",
      }}
    >
      <summary
        style={{
          padding: 20,
          cursor: "pointer",
          listStyle: "none",
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          fontFamily: POLICE,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 700, color: ENCRE }}>{titre}</span>
        {sousTitre && <span style={{ fontSize: 12, color: ENCRE_DOUCE }}>{sousTitre}</span>}
        <span className="ms" style={{ marginLeft: "auto", fontSize: 20, color: AXE }}>
          expand_more
        </span>
      </summary>
      <div style={{ padding: "0 20px 20px" }}>{children}</div>
    </details>
  );
}
