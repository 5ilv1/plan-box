"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { TypeBloc, StatutBloc } from "@/types";
import { BlocGroupe, EleveBloc } from "./BlocJourCard";

interface LignePlanTravail {
  id: string;
  type: TypeBloc;
  titre: string;
  statut: StatutBloc;
  date_assignation: string;
  date_limite: string | null;
  periodicite: "jour" | "semaine" | null;
  eleve_id: string | null;
  repetibox_eleve_id: number | null;
  chapitre_id: string | null;
  groupe_label: string | null;
  eleve_prenom: string;
  eleve_nom: string;
}

function statutEffectif(statut: StatutBloc, dateLimite: string | null, today: string): StatutBloc | "en_retard" {
  if (statut === "fait") return "fait";
  if (dateLimite && dateLimite < today) return "en_retard";
  return statut;
}

function grouperBlocs(lignes: LignePlanTravail[], today: string): BlocGroupe[] {
  const map = new Map<string, BlocGroupe>();
  lignes.forEach((ligne) => {
    const cle = `${ligne.type}__${ligne.titre}__${ligne.chapitre_id ?? "null"}`;
    const statut = statutEffectif(ligne.statut, ligne.date_limite, today);
    if (!map.has(cle)) {
      map.set(cle, {
        cle, type: ligne.type, titre: ligne.titre, chapitreId: ligne.chapitre_id,
        eleves: [], dateAssignation: ligne.date_assignation, dateLimite: ligne.date_limite,
        periodicite: ligne.periodicite ?? "jour", groupeLabels: [],
      });
    }
    const bloc = map.get(cle)!;
    if (ligne.groupe_label && !bloc.groupeLabels.includes(ligne.groupe_label)) {
      bloc.groupeLabels.push(ligne.groupe_label);
    }
    const eleveId = ligne.eleve_id ?? `rb_${ligne.repetibox_eleve_id}`;
    const eleve: EleveBloc = { planTravailId: ligne.id, eleveId, prenom: ligne.eleve_prenom, nom: ligne.eleve_nom, statut };
    bloc.eleves.push(eleve);
  });
  return [...map.values()];
}

export default function AujourdhuiSection({ variant }: { variant?: "hero" | "default" } = {}) {
  const [blocs, setBlocs] = useState<BlocGroupe[]>([]);
  const [chargement, setChargement] = useState(true);
  const [elevesConnectesAujourdhui, setElevesConnectesAujourdhui] = useState(0);

  const today = new Date().toISOString().split("T")[0];

  const charger = useCallback(async () => {
    const [resPT, resRB] = await Promise.all([
      fetch("/api/admin/dashboard-aujourd-hui"),
      fetch("/api/admin/repetibox-blocs-jour"),
    ]);
    const jsonPT = resPT.ok ? await resPT.json() : { blocs: [], elevesConnectesAujourdhui: 0 };
    const jsonRB = resRB.ok ? await resRB.json() : { groupeLabels: [], eleves: [] };

    // Blocs plan_travail
    const grouped = grouperBlocs(jsonPT.blocs ?? [], today);

    // Un seul bloc Repetibox global
    if ((jsonRB.eleves ?? []).length > 0) {
      grouped.push({
        cle: "repetibox__global", type: "repetibox", titre: "Révisions Repetibox",
        chapitreId: null, groupeLabels: jsonRB.groupeLabels ?? [],
        dateAssignation: today, dateLimite: null, periodicite: "jour",
        eleves: (jsonRB.eleves ?? []).map((e: { rb_eleve_id: number; prenom: string; nom: string; total_cartes_dues: number; statut: string }) => ({
          planTravailId: `rb_${e.rb_eleve_id}`,
          eleveId: `rb_${e.rb_eleve_id}`,
          prenom: e.prenom, nom: e.nom,
          statut: "a_faire" as const,
          detail: e.statut === "nouveau" ? "nouveau" : e.total_cartes_dues === 0 ? "0 carte" : `${e.total_cartes_dues} carte${e.total_cartes_dues > 1 ? "s" : ""}`,
        })),
      });
    }

    setBlocs(grouped);
    setElevesConnectesAujourdhui(jsonPT.elevesConnectesAujourdhui ?? 0);
    setChargement(false);
  }, [today]);

  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("aujourd_hui_stats")
      .on("postgres_changes", { event: "*", schema: "public", table: "plan_travail" }, charger)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [charger]);

  const totalBlocs = blocs.length;
  const faits = blocs.reduce((s, b) => s + b.eleves.filter((e) => e.statut === "fait").length, 0);

  const stats = [
    { valeur: totalBlocs,                label: "Blocs",     couleur: "var(--primary)" },
    { valeur: elevesConnectesAujourdhui, label: "Connectés", couleur: "#0D2E76" },
    { valeur: faits,                     label: "Activités", couleur: "#16A34A" },
  ];

  // Mode Hero : rendu inline dans la bannière bleue
  if (variant === "hero") {
    if (chargement) {
      return (
        <div className="ens-hero-stats">
          {[1, 2, 3].map((i) => (
            <div key={i} className="ens-hero-stat">
              <div className="num" style={{ opacity: 0.4 }}>–</div>
              <div className="label">...</div>
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="ens-hero-stats">
        {stats.map(({ valeur, label }) => (
          <div key={label} className="ens-hero-stat">
            <div className="num">{valeur}</div>
            <div className="label">{label}</div>
          </div>
        ))}
      </div>
    );
  }

  // Mode Default : ancien rendu
  if (chargement) {
    return (
      <div style={{ padding: "20px 0", borderBottom: "1px solid var(--border)", backgroundColor: "var(--white)" }}>
        <div className="container">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 12 }} />)}
          </div>
        </div>
      </div>
    );
  }

  if (totalBlocs === 0) return null;

  return (
    <div style={{ backgroundColor: "var(--white)", borderBottom: "1px solid var(--border)" }}>
      <div className="container" style={{ paddingTop: 20, paddingBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {stats.map(({ valeur, label, couleur }) => (
            <div key={label} style={{ textAlign: "center", padding: "16px 12px", borderRadius: 12, background: "var(--bg)", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 40, fontWeight: 800, color: couleur, lineHeight: 1.1 }}>{valeur}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, fontWeight: 500 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
