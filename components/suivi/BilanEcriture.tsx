"use client";

import { useEffect, useState } from "react";
import { diffMots, bilanCorrections, type FauteSignalee } from "@/lib/ecriture-bilan";

/**
 * Le texte d'un élève, avec ce que la correction automatique en a fait.
 *
 * Comparé à son PREMIER JET — le texte au premier « Corriger mon texte » :
 * barré en rouge ce qu'il a retiré, en vert ce qu'il a ajouté. En dessous,
 * chaque faute signalée et son sort, avec le mot attendu — que l'élève, lui,
 * n'a jamais vu.
 *
 * Les passages viennent de `ecriture_analyse` (`/api/enseignant/ecriture/analyses`).
 */

interface Analyse { cree_le: string; texte: string; erreurs: FauteSignalee[] }

const STATUTS = {
  corrigee: { icone: "✓", libelle: "corrigée", couleur: "#15803D", fond: "#F0FDF4" },
  modifiee: { icone: "~", libelle: "modifiée", couleur: "#B45309", fond: "#FFFBEB" },
  laissee: { icone: "✗", libelle: "laissée", couleur: "#B91C1C", fond: "#FEF2F2" },
} as const;

const TYPES: Record<string, string> = {
  orthographe: "orthographe", grammaire: "accord / temps", homophone: "homophone", syntaxe: "majuscule / élision",
};

export default function BilanEcriture({ blocId, texteFinal }: { blocId: string; texteFinal: string }) {
  const [analyses, setAnalyses] = useState<{ nb: number; premiere: Analyse | null } | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let vivant = true;
    fetch(`/api/enseignant/ecriture/analyses?blocId=${blocId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (vivant) setAnalyses({ nb: d.nb ?? 0, premiere: d.premiere ?? null }); })
      .catch(() => { if (vivant) setErreur(true); });
    return () => { vivant = false; };
  }, [blocId]);

  const nbMots = texteFinal.split(/\s+/).filter(Boolean).length;
  const premiere = analyses?.premiere ?? null;
  const segments = premiere ? diffMots(premiere.texte, texteFinal) : null;
  const bilan = premiere ? bilanCorrections(premiere.texte, premiere.erreurs ?? [], texteFinal) : [];
  const compte = (s: keyof typeof STATUTS) => bilan.filter((b) => b.statut === s).length;

  return (
    <div style={{ padding: 14, borderRadius: 10, border: "1px solid var(--border)", background: "white", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 999, background: "#EEF2FF", color: "#4338CA" }}>
          Texte rendu
        </span>
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          {nbMots} mot{nbMots > 1 ? "s" : ""}
        </span>
        {analyses && (
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            · {analyses.nb === 0
              // « enregistrée », pas « demandée » : les textes écrits avant le
              // 24/09 midi ont pu être corrigés sans laisser de trace.
              ? "aucune correction enregistrée"
              : `${analyses.nb} correction${analyses.nb > 1 ? "s" : ""} demandée${analyses.nb > 1 ? "s" : ""}`}
          </span>
        )}
      </div>

      {/* Le texte : annoté s'il y a eu une correction, brut sinon. */}
      <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap", fontFamily: "'Lora', Georgia, serif", color: "var(--text)" }}>
        {segments
          ? segments.map((s, i) =>
              s.type === "egal" ? <span key={i}>{s.texte}</span>
              : s.type === "retrait"
                ? <span key={i} style={{ color: "#B91C1C", textDecoration: "line-through", background: "#FEF2F2" }}>{s.texte}</span>
                : <span key={i} style={{ color: "#15803D", fontWeight: 700, background: "#F0FDF4" }}>{s.texte}</span>)
          : texteFinal}
      </div>
      {segments && segments.some((s) => s.type !== "egal") && (
        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          <span style={{ color: "#B91C1C", textDecoration: "line-through" }}>barré</span> : retiré par l&apos;élève après correction ·{" "}
          <span style={{ color: "#15803D", fontWeight: 700 }}>vert</span> : ajouté
        </div>
      )}

      {/* Les fautes signalées, et leur sort. */}
      {bilan.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
            {bilan.length} faute{bilan.length > 1 ? "s" : ""} signalée{bilan.length > 1 ? "s" : ""} :{" "}
            <span style={{ color: STATUTS.corrigee.couleur }}>{compte("corrigee")} corrigée{compte("corrigee") > 1 ? "s" : ""}</span>
            {compte("modifiee") > 0 && <>, <span style={{ color: STATUTS.modifiee.couleur }}>{compte("modifiee")} modifiée{compte("modifiee") > 1 ? "s" : ""}</span></>}
            {compte("laissee") > 0 && <>, <span style={{ color: STATUTS.laissee.couleur }}>{compte("laissee")} laissée{compte("laissee") > 1 ? "s" : ""}</span></>}
          </div>
          {bilan.map((b, i) => {
            const st = STATUTS[b.statut];
            return (
              <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "6px 10px", borderRadius: 8, background: st.fond, fontSize: 13 }}>
                <span style={{ fontWeight: 800, color: st.couleur, width: 14 }}>{st.icone}</span>
                <span>
                  <strong>« {b.mot} »</strong>
                  {b.attendu && <> → <strong style={{ color: "#15803D" }}>{b.attendu}</strong></>}
                  <span style={{ color: st.couleur }}> — {st.libelle}</span>
                  {b.statut === "modifiee" && (
                    <span style={{ color: "var(--text-secondary)" }}>
                      {b.remplacement ? <> (l&apos;élève a écrit « {b.remplacement} »)</> : " (supprimé)"}
                    </span>
                  )}
                </span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                  {TYPES[b.type] ?? b.type}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {premiere && bilan.length === 0 && (
        <div style={{ fontSize: 12, color: "#15803D" }}>La correction n&apos;a trouvé aucune faute dans le premier jet.</div>
      )}
      {erreur && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Le détail des corrections n&apos;a pas pu être chargé.</div>
      )}
    </div>
  );
}
