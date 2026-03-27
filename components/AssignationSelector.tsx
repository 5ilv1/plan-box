"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { Groupe, Eleve, Niveau } from "@/types";
import { AssignationSelecteur } from "@/types";

interface EleveOption {
  uid: string;
  label: string;
  source: "planbox" | "repetibox";
}

interface AssignationSelectorProps {
  value: AssignationSelecteur;
  onChange: (val: AssignationSelecteur) => void;
}

export default function AssignationSelector({ value, onChange }: AssignationSelectorProps) {
  const supabase = createClient();

  const [groupes, setGroupes] = useState<Groupe[]>([]);
  const [eleves, setEleves] = useState<EleveOption[]>([]);
  const [chargement, setChargement] = useState(true);
  const [showEleves, setShowEleves] = useState(false);
  const [recherche, setRecherche] = useState("");

  useEffect(() => {
    async function charger() {
      const [{ data: grp }, { data: elv }, rbRes] = await Promise.all([
        supabase.from("groupes").select("*").order("nom"),
        supabase.from("eleves").select("*, niveaux(*)").order("nom"),
        fetch("/api/repetibox-eleves").then((r) => r.json()).catch(() => ({ eleves: [] })),
      ]);

      setGroupes((grp ?? []) as Groupe[]);

      const pb: EleveOption[] = ((elv ?? []) as (Eleve & { niveaux?: Niveau })[]).map((e) => ({
        uid: `pb_${e.id}`,
        label: `${e.prenom} ${e.nom}${e.niveaux ? ` (${e.niveaux.nom})` : ""}`,
        source: "planbox" as const,
      }));
      const rb: EleveOption[] = (rbRes?.eleves ?? []).map((e: { id: number; prenom: string; nom: string }) => ({
        uid: `rb_${e.id}`,
        label: `${e.prenom} ${e.nom}`,
        source: "repetibox" as const,
      }));
      setEleves([...pb, ...rb]);
      setChargement(false);
    }
    charger();
  }, []);

  function setTouteClasse() {
    const tousUids = eleves.map((e) => e.uid);
    const tousCoches = tousUids.every((uid) => value.eleveUids.includes(uid));
    if (tousCoches) {
      onChange({ ...value, eleveUids: [], groupeIds: [], groupeNoms: [], touteClasse: false });
    } else {
      onChange({ ...value, eleveUids: tousUids, groupeIds: [], groupeNoms: [], touteClasse: true });
    }
  }

  function toggleGroupe(id: string, nom: string) {
    const inclus = value.groupeIds.includes(id);
    onChange({
      ...value,
      touteClasse: false,
      eleveUids: [],
      groupeIds: inclus ? value.groupeIds.filter((g) => g !== id) : [...value.groupeIds, id],
      groupeNoms: inclus ? value.groupeNoms.filter((n) => n !== nom) : [...value.groupeNoms, nom],
    });
  }

  function toggleEleve(uid: string) {
    const inclus = value.eleveUids.includes(uid);
    onChange({
      ...value,
      touteClasse: false,
      eleveUids: inclus ? value.eleveUids.filter((u) => u !== uid) : [...value.eleveUids, uid],
    });
  }

  const tousElevesCoches = eleves.length > 0 && eleves.every((e) => value.eleveUids.includes(e.uid));
  const aucunSelectionne = value.groupeIds.length === 0 && value.eleveUids.length === 0 && !tousElevesCoches;
  const elevesFiltrés = recherche.trim()
    ? eleves.filter((e) => e.label.toLowerCase().includes(recherche.toLowerCase()))
    : eleves;
  const pbEleves = elevesFiltrés.filter((e) => e.source === "planbox");
  const rbEleves = elevesFiltrés.filter((e) => e.source === "repetibox");

  if (chargement) {
    return <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Chargement des élèves…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* ── Ligne de boutons : Toute la classe + groupes ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {/* Toute la classe */}
        <button
          type="button"
          onClick={setTouteClasse}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "8px 16px", borderRadius: 20, cursor: "pointer",
            fontSize: 13, fontWeight: 700, transition: "all 0.15s", fontFamily: "var(--font)",
            border: `2px solid ${tousElevesCoches ? "var(--primary)" : "var(--border)"}`,
            background: tousElevesCoches ? "var(--primary-pale)" : "white",
            color: tousElevesCoches ? "var(--primary)" : "var(--text)",
          }}
        >
          <span className="ms" style={{ fontSize: 16 }}>school</span>
          Toute la classe
          {eleves.length > 0 && (
            <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.75 }}>({eleves.length})</span>
          )}
        </button>

        {/* Bouton par groupe */}
        {groupes.map((g) => {
          const actif = value.groupeIds.includes(g.id);
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => toggleGroupe(g.id, g.nom)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 20, cursor: "pointer",
                fontSize: 13, fontWeight: actif ? 700 : 500, transition: "all 0.15s", fontFamily: "var(--font)",
                border: `2px solid ${actif ? "var(--primary)" : "var(--border)"}`,
                background: actif ? "var(--primary-pale)" : "white",
                color: actif ? "var(--primary)" : "var(--text)",
              }}
            >
              {actif
                ? <span className="ms" style={{ fontSize: 14 }}>check_circle</span>
                : <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>○</span>}
              {g.nom}
            </button>
          );
        })}
      </div>

      {/* ── Picker élèves individuels ── */}
      <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
        <button
          type="button"
          onClick={() => setShowEleves(!showEleves)}
          style={{
            width: "100%", padding: "10px 14px", background: "white", border: "none",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
            fontFamily: "var(--font)", fontWeight: 600, fontSize: 13, color: "var(--text)", textAlign: "left",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="ms" style={{ fontSize: 15 }}>person</span>
            Élèves individuels
            {value.eleveUids.length > 0 && !tousElevesCoches && (
              <span style={{ color: "var(--primary)", fontWeight: 700 }}>
                ({value.eleveUids.length} sélectionné{value.eleveUids.length > 1 ? "s" : ""})
              </span>
            )}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{showEleves ? "▲" : "▼"}</span>
        </button>

        {showEleves && (
          <div style={{ borderTop: "1px solid var(--border)", background: "var(--bg)", padding: "12px 14px" }}>
            {/* Recherche */}
            <input
              className="form-input"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher un élève…"
              style={{ marginBottom: 10, fontSize: 13 }}
            />

            {eleves.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Aucun élève disponible.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 240, overflowY: "auto" }}>
                {pbEleves.length > 0 && (
                  <>
                    {rbEleves.length > 0 && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                        <span className="ms" style={{ fontSize: 12, verticalAlign: "middle" }}>assignment</span> Plan Box
                      </div>
                    )}
                    {pbEleves.map((e) => {
                      const coche = value.eleveUids.includes(e.uid);
                      return (
                        <label key={e.uid} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "5px 8px", borderRadius: 6, background: coche ? "var(--primary-pale)" : "transparent", transition: "background 0.15s" }}>
                          <input type="checkbox" checked={coche} onChange={() => toggleEleve(e.uid)} style={{ accentColor: "var(--primary)", width: 15, height: 15 }} />
                          <span style={{ fontSize: 13, color: coche ? "var(--primary)" : "var(--text)", fontWeight: coche ? 600 : 400 }}>{e.label}</span>
                        </label>
                      );
                    })}
                  </>
                )}
                {rbEleves.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5, marginTop: pbEleves.length > 0 ? 10 : 2, marginBottom: 4 }}>
                      <span className="ms" style={{ fontSize: 12, verticalAlign: "middle" }}>style</span> Repetibox
                    </div>
                    {rbEleves.map((e) => {
                      const coche = value.eleveUids.includes(e.uid);
                      return (
                        <label key={e.uid} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "5px 8px", borderRadius: 6, background: coche ? "var(--primary-pale)" : "transparent", transition: "background 0.15s" }}>
                          <input type="checkbox" checked={coche} onChange={() => toggleEleve(e.uid)} style={{ accentColor: "var(--primary)", width: 15, height: 15 }} />
                          <span style={{ fontSize: 13, color: coche ? "var(--primary)" : "var(--text)", fontWeight: coche ? 600 : 400 }}>{e.label}</span>
                        </label>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {aucunSelectionne && (
        <p style={{ fontSize: 12, color: "var(--error)", marginTop: 4 }}>
          Sélectionne au moins un groupe ou un élève.
        </p>
      )}
    </div>
  );
}
