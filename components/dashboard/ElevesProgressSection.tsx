"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import ElevePanel from "./ElevePanel";

interface EleveStats {
  eleveId: string;
  prenom: string;
  nom: string;
  isRepetibox: boolean;
  total: number;
  faits: number;
  enCours: number;
  aFaire: number;
  enRetard: number;
}

export default function ElevesProgressSection() {
  const [eleves, setEleves] = useState<EleveStats[]>([]);
  const [chargement, setChargement] = useState(true);
  const [eleveActif, setEleveActif] = useState<{ id: string; prenom: string } | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const charger = useCallback(async () => {
    const supabase = createClient();

    const { data: ptData } = await supabase
      .from("plan_travail")
      .select("statut, date_limite, eleve_id, repetibox_eleve_id")
      .eq("date_assignation", today);

    const lignes = ptData ?? [];
    if (lignes.length === 0) {
      setEleves([]);
      setChargement(false);
      return;
    }

    // Résolution des noms PB et RB en parallèle
    const pbIds = [...new Set(lignes.map((l) => l.eleve_id).filter(Boolean))] as string[];
    const rbIds = [...new Set(lignes.map((l) => l.repetibox_eleve_id).filter((id) => id != null))] as number[];

    const [pbRes, rbRes] = await Promise.all([
      pbIds.length > 0
        ? supabase.from("eleves").select("id, prenom, nom").in("id", pbIds)
        : Promise.resolve({ data: [] as { id: string; prenom: string; nom: string }[] }),
      rbIds.length > 0
        ? fetch("/api/repetibox-eleves").then((r) => r.json()).catch(() => ({ eleves: [] }))
        : Promise.resolve({ eleves: [] }),
    ]);

    const pbMap = new Map<string, { prenom: string; nom: string }>();
    (pbRes.data ?? []).forEach((e: any) => pbMap.set(e.id, e));

    const rbMap = new Map<number, { prenom: string; nom: string }>();
    (rbRes?.eleves ?? []).forEach((e: any) => { if (rbIds.includes(e.id)) rbMap.set(e.id, e); });

    // Agréger par élève
    const map = new Map<string, EleveStats>();

    lignes.forEach((l) => {
      const eleveId = l.eleve_id ?? `rb_${l.repetibox_eleve_id}`;
      const isRepetibox = !l.eleve_id;
      const meta = l.eleve_id
        ? pbMap.get(l.eleve_id)
        : rbMap.get(l.repetibox_eleve_id);

      if (!map.has(eleveId)) {
        map.set(eleveId, {
          eleveId,
          prenom: meta?.prenom ?? "—",
          nom: meta?.nom ?? "",
          isRepetibox,
          total: 0,
          faits: 0,
          enCours: 0,
          aFaire: 0,
          enRetard: 0,
        });
      }

      const s = map.get(eleveId)!;
      s.total++;

      const enRetard = l.statut !== "fait" && l.date_limite && l.date_limite < today;
      if (l.statut === "fait") s.faits++;
      else if (enRetard) s.enRetard++;
      else if (l.statut === "en_cours") s.enCours++;
      else s.aFaire++;
    });

    // Trier : élèves les moins avancés en premier, 100% faits en bas
    const sorted = [...map.values()].sort((a, b) => {
      const pctA = a.faits / a.total;
      const pctB = b.faits / b.total;
      return pctA - pctB;
    });

    setEleves(sorted);
    setChargement(false);
  }, [today]);

  useEffect(() => { charger(); }, [charger]);

  // Realtime
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("elevesprogress_today")
      .on("postgres_changes", { event: "*", schema: "public", table: "plan_travail" }, charger)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [charger]);

  if (chargement) {
    return (
      <div className="container" style={{ paddingTop: 16, paddingBottom: 8 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 56, borderRadius: 12, marginBottom: 8 }} />
        ))}
      </div>
    );
  }

  if (eleves.length === 0) return null;

  return (
    <>
      <section style={{ backgroundColor: "var(--white)", borderBottom: "1px solid var(--border)", paddingBottom: 16 }}>
        <div className="container" style={{ paddingTop: 16, paddingBottom: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>
            <span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>group</span> Élèves — progression du jour
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {eleves.map((e) => {
              const pct = e.total > 0 ? Math.round((e.faits / e.total) * 100) : 0;
              const toutFait = e.faits === e.total;
              return (
                <div
                  key={e.eleveId}
                  className="card"
                  onClick={() => setEleveActif({ id: e.eleveId, prenom: e.prenom })}
                  style={{
                    padding: "10px 14px",
                    cursor: "pointer",
                    opacity: toutFait ? 0.75 : 1,
                    border: e.enRetard > 0
                      ? "1.5px solid #FCA5A5"
                      : toutFait
                      ? "1.5px solid #86EFAC"
                      : "1.5px solid var(--border)",
                    backgroundColor: toutFait ? "#F0FDF4" : "var(--white)",
                    transition: "box-shadow 0.15s ease",
                  }}
                  onMouseEnter={(ev) => { (ev.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; }}
                  onMouseLeave={(ev) => { (ev.currentTarget as HTMLDivElement).style.boxShadow = ""; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {/* Avatar */}
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                      backgroundColor: e.isRepetibox ? "#FEF3C7" : "#DBEAFE",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 14,
                    }}>
                      <span className="ms" style={{ fontSize: 16 }}>{e.isRepetibox ? "style" : "person"}</span>
                    </div>

                    {/* Nom */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {e.prenom} {e.nom}
                      </div>

                      {/* Barre de progression */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                        <div style={{ flex: 1, height: 5, backgroundColor: "var(--border)", borderRadius: 999, overflow: "hidden" }}>
                          <div style={{
                            height: "100%",
                            width: `${pct}%`,
                            backgroundColor: toutFait ? "#16A34A" : e.enRetard > 0 ? "#DC2626" : "#2563EB",
                            borderRadius: 999,
                            transition: "width 0.3s ease",
                          }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", flexShrink: 0 }}>
                          {e.faits}/{e.total}
                        </span>
                      </div>
                    </div>

                    {/* Badges statut */}
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      {e.faits > 0 && (
                        <span className="badge badge-success" style={{ fontSize: 11 }}>{e.faits} <span className="ms" style={{ fontSize: 12, verticalAlign: "middle" }}>check_circle</span></span>
                      )}
                      {e.enCours > 0 && (
                        <span className="badge badge-primary" style={{ fontSize: 11 }}>{e.enCours} <span className="ms" style={{ fontSize: 12, verticalAlign: "middle", color: "#2563EB" }}>circle</span></span>
                      )}
                      {e.enRetard > 0 && (
                        <span className="badge badge-error" style={{ fontSize: 11 }}>{e.enRetard} <span className="ms" style={{ fontSize: 12, verticalAlign: "middle" }}>schedule</span></span>
                      )}
                      {e.aFaire > 0 && !toutFait && (
                        <span className="badge" style={{ fontSize: 11, backgroundColor: "#F3F4F6", color: "#6B7280", border: "1px solid #D1D5DB" }}>
                          {e.aFaire} à faire
                        </span>
                      )}
                    </div>

                    <span style={{ fontSize: 14, color: "var(--text-secondary)", flexShrink: 0 }}>›</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {eleveActif && (
        <ElevePanel
          eleveId={eleveActif.id}
          prenom={eleveActif.prenom}
          onClose={() => setEleveActif(null)}
        />
      )}
    </>
  );
}
