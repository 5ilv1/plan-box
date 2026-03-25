"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { Groupe, Eleve, Niveau } from "@/types";
import { AssignationSelecteur } from "@/types";

interface EleveOption {
  uid: string;   // "pb_UUID" ou "rb_5"
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
  const [sectionOuverte, setSectionOuverte] = useState<"groupes" | "individuel" | null>("groupes");

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

  function toggleGroupe(id: string, nom: string) {
    const inclus = value.groupeIds.includes(id);
    const newGroupeIds = inclus
      ? value.groupeIds.filter((g) => g !== id)
      : [...value.groupeIds, id];
    const newGroupeNoms = inclus
      ? value.groupeNoms.filter((n) => n !== nom)
      : [...value.groupeNoms, nom];
    onChange({ ...value, groupeIds: newGroupeIds, groupeNoms: newGroupeNoms });
  }

  function toggleEleve(uid: string) {
    const inclus = value.eleveUids.includes(uid);
    const newEleveUids = inclus
      ? value.eleveUids.filter((u) => u !== uid)
      : [...value.eleveUids, uid];
    // Si on coche/décoche manuellement un élève, ce n'est plus "toute la classe"
    onChange({ ...value, eleveUids: newEleveUids, touteClasse: false });
  }

  function toutSelectionnerGroupes() {
    const tousCoches = groupes.every((g) => value.groupeIds.includes(g.id));
    if (tousCoches) {
      onChange({ ...value, groupeIds: [], groupeNoms: [] });
    } else {
      onChange({ ...value, groupeIds: groupes.map((g) => g.id), groupeNoms: groupes.map((g) => g.nom) });
    }
  }

  function touteLaClasse() {
    const tousUids = eleves.map((e) => e.uid);
    const tousCochesDeja = tousUids.every((uid) => value.eleveUids.includes(uid));
    if (tousCochesDeja) {
      onChange({ ...value, eleveUids: [], touteClasse: false });
    } else {
      onChange({ ...value, eleveUids: tousUids, touteClasse: true });
    }
  }

  const tousElevesCoches = eleves.length > 0 && eleves.every((e) => value.eleveUids.includes(e.uid));
  const aucunSelectionne = value.groupeIds.length === 0 && value.eleveUids.length === 0;
  const nbSelectionnes = value.groupeIds.length + value.eleveUids.length;
  const pbEleves = eleves.filter((e) => e.source === "planbox");
  const rbEleves = eleves.filter((e) => e.source === "repetibox");
  const tousGroupesCoches = groupes.length > 0 && groupes.every((g) => value.groupeIds.includes(g.id));

  if (chargement) {
    return <div className="text-secondary text-sm">Chargement des élèves…</div>;
  }

  return (
    <div>
      {/* Bouton Toute la classe */}
      {eleves.length > 0 && (
        <button
          type="button"
          onClick={touteLaClasse}
          style={{
            width: "100%",
            padding: "10px 16px",
            marginBottom: 10,
            borderRadius: 10,
            border: `2px solid ${tousElevesCoches ? "var(--primary)" : "var(--border)"}`,
            background: tousElevesCoches ? "var(--primary-pale)" : "var(--white)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontFamily: "var(--font)",
            fontWeight: 700,
            fontSize: 14,
            color: tousElevesCoches ? "var(--primary)" : "var(--text)",
            transition: "all 0.15s",
          }}
        >
          <span><span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>school</span> Toute la classe</span>
          <span style={{ fontSize: 13, fontWeight: 400, color: tousElevesCoches ? "var(--primary)" : "var(--text-secondary)" }}>
            {tousElevesCoches ? <><span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>check_circle</span> {eleves.length} élèves</> : `${eleves.length} élèves`}
          </span>
        </button>
      )}

      {/* Résumé */}
      {nbSelectionnes > 0 && (
        <div
          style={{
            background: "var(--primary-pale)",
            borderRadius: 8,
            padding: "8px 12px",
            marginBottom: 12,
            fontSize: 13,
            color: "var(--primary)",
            fontWeight: 600,
          }}
        >
          {value.groupeIds.length > 0 && `${value.groupeIds.length} groupe(s)`}
          {value.groupeIds.length > 0 && value.eleveUids.length > 0 && " + "}
          {value.eleveUids.length > 0 && `${value.eleveUids.length} élève(s) individuel(s)`}
        </div>
      )}

      {/* Section Groupes */}
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 10,
          overflow: "hidden",
          marginBottom: 10,
        }}
      >
        <button
          type="button"
          onClick={() => setSectionOuverte(sectionOuverte === "groupes" ? null : "groupes")}
          style={{
            width: "100%",
            padding: "10px 14px",
            background: "var(--white)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontFamily: "var(--font)",
            fontWeight: 600,
            fontSize: 14,
            color: "var(--text)",
            textAlign: "left",
          }}
        >
          <span>
            <span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>group</span> Groupes{" "}
            {value.groupeIds.length > 0 && (
              <span style={{ color: "var(--primary)", fontWeight: 700 }}>
                ({value.groupeIds.length} sélectionné{value.groupeIds.length > 1 ? "s" : ""})
              </span>
            )}
          </span>
          <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>
            {sectionOuverte === "groupes" ? "▲" : "▼"}
          </span>
        </button>

        {sectionOuverte === "groupes" && (
          <div
            style={{
              padding: "12px 14px",
              borderTop: "1px solid var(--border)",
              background: "var(--bg)",
            }}
          >
            {groupes.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                Aucun groupe.{" "}
                <a href="/enseignant/groupes" style={{ color: "var(--primary)" }}>
                  Créer des groupes →
                </a>
              </p>
            ) : (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  {groupes.map((g) => {
                    const coche = value.groupeIds.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => toggleGroupe(g.id, g.nom)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "6px 14px",
                          borderRadius: 20,
                          border: `1.5px solid ${coche ? "var(--primary)" : "var(--border)"}`,
                          background: coche ? "var(--primary-pale)" : "var(--white)",
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: coche ? 700 : 400,
                          color: coche ? "var(--primary)" : "var(--text)",
                          transition: "all 0.15s",
                          fontFamily: "var(--font)",
                        }}
                      >
                        {coche ? <span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>check_circle</span> : "○"} {g.nom}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={toutSelectionnerGroupes}
                  style={{
                    fontSize: 12,
                    color: "var(--primary)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    fontFamily: "var(--font)",
                    textDecoration: "underline",
                  }}
                >
                  {tousGroupesCoches ? "Tout décocher" : "Tout sélectionner"}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Section Élèves individuels */}
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <button
          type="button"
          onClick={() => setSectionOuverte(sectionOuverte === "individuel" ? null : "individuel")}
          style={{
            width: "100%",
            padding: "10px 14px",
            background: "var(--white)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontFamily: "var(--font)",
            fontWeight: 600,
            fontSize: 14,
            color: "var(--text)",
            textAlign: "left",
          }}
        >
          <span>
            <span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>person</span> Élèves individuels{" "}
            {value.eleveUids.length > 0 && (
              <span style={{ color: "var(--primary)", fontWeight: 700 }}>
                ({value.eleveUids.length} sélectionné{value.eleveUids.length > 1 ? "s" : ""})
              </span>
            )}
          </span>
          <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>
            {sectionOuverte === "individuel" ? "▲" : "▼"}
          </span>
        </button>

        {sectionOuverte === "individuel" && (
          <div
            style={{
              padding: "12px 14px",
              borderTop: "1px solid var(--border)",
              background: "var(--bg)",
            }}
          >
            {eleves.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                Aucun élève disponible.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {pbEleves.length > 0 && (
                  <>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--text-secondary)",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        marginBottom: 4,
                        marginTop: 2,
                      }}
                    >
                      <span className="ms" style={{ fontSize: 12, verticalAlign: "middle" }}>assignment</span> Plan Box
                    </div>
                    {pbEleves.map((e) => {
                      const coche = value.eleveUids.includes(e.uid);
                      return (
                        <label
                          key={e.uid}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            cursor: "pointer",
                            padding: "5px 8px",
                            borderRadius: 6,
                            background: coche ? "var(--primary-pale)" : "transparent",
                            transition: "background 0.15s",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={coche}
                            onChange={() => toggleEleve(e.uid)}
                            style={{ accentColor: "var(--primary)", width: 15, height: 15 }}
                          />
                          <span
                            style={{
                              fontSize: 13,
                              color: coche ? "var(--primary)" : "var(--text)",
                              fontWeight: coche ? 600 : 400,
                            }}
                          >
                            {e.label}
                          </span>
                        </label>
                      );
                    })}
                  </>
                )}
                {rbEleves.length > 0 && (
                  <>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--text-secondary)",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        marginTop: pbEleves.length > 0 ? 10 : 2,
                        marginBottom: 4,
                      }}
                    >
                      <span className="ms" style={{ fontSize: 12, verticalAlign: "middle" }}>style</span> Repetibox
                    </div>
                    {rbEleves.map((e) => {
                      const coche = value.eleveUids.includes(e.uid);
                      return (
                        <label
                          key={e.uid}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            cursor: "pointer",
                            padding: "5px 8px",
                            borderRadius: 6,
                            background: coche ? "var(--primary-pale)" : "transparent",
                            transition: "background 0.15s",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={coche}
                            onChange={() => toggleEleve(e.uid)}
                            style={{ accentColor: "var(--primary)", width: 15, height: 15 }}
                          />
                          <span
                            style={{
                              fontSize: 13,
                              color: coche ? "var(--primary)" : "var(--text)",
                              fontWeight: coche ? 600 : 400,
                            }}
                          >
                            {e.label}
                          </span>
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

      {/* Message d'erreur si rien sélectionné */}
      {aucunSelectionne && (
        <p style={{ fontSize: 12, color: "var(--error)", marginTop: 8 }}>
          Sélectionne au moins un groupe ou un élève.
        </p>
      )}
    </div>
  );
}
