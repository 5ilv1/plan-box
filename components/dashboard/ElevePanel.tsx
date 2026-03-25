"use client";

import React, { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { TYPE_BLOC_CONFIG, STATUT_BLOC_CONFIG, TypeBloc, StatutBloc } from "@/types";

interface BlocTravail {
  id: string;
  type: TypeBloc;
  titre: string;
  statut: StatutBloc;
  date_assignation: string;
  date_limite: string | null;
  periodicite: "jour" | "semaine" | null;
  contenu: Record<string, unknown> | null;
}

interface ElevePanelProps {
  eleveId: string | null;
  prenom: string;
  onClose: () => void;
  inline?: boolean;
}

function dateLocale(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getLundiStr(): string {
  const d = new Date();
  const jour = d.getDay();
  const diff = jour === 0 ? -6 : 1 - jour;
  d.setDate(d.getDate() + diff);
  return dateLocale(d);
}

function getDimancheStr(): string {
  const d = new Date();
  const jour = d.getDay();
  const diff = jour === 0 ? 0 : 7 - jour;
  d.setDate(d.getDate() + diff);
  return dateLocale(d);
}

function formatDateLabel(dateStr: string, today: string): string {
  if (dateStr === today) return "Aujourd'hui";
  return new Date(dateStr + "T12:00:00").toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "short",
  });
}

function getISOWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const diff = (d.getTime() - startOfWeek1.getTime()) / (7 * 24 * 3600 * 1000);
  const week = Math.floor(diff) + 1;
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function lundiDeSemaine(semaine: string): string {
  const [annee, w] = semaine.split("-W");
  const jan4 = new Date(parseInt(annee, 10), 0, 4);
  const lundi = new Date(jan4);
  lundi.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (parseInt(w, 10) - 1) * 7);
  return dateLocale(lundi);
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "var(--text-secondary)",
  textTransform: "uppercase", letterSpacing: "0.05em",
  display: "block", marginBottom: 5,
};

// ── Éditeur inline d'un bloc ─────────────────────────────────────────────────

function BlocEditeur({
  bloc,
  today,
  eleveId,
  onSaved,
  onDeleted,
}: {
  bloc: BlocTravail;
  today: string;
  eleveId: string;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const supabase = createClient();

  const [titre, setTitre] = useState(bloc.titre);
  const [periodicite, setPeriodicite] = useState<"jour" | "semaine">(bloc.periodicite ?? "jour");
  const [dateAssignation, setDateAssignation] = useState(bloc.date_assignation);
  const [semaineAssignation, setSemaineAssignation] = useState(getISOWeek(bloc.date_assignation));
  const [dateLimite, setDateLimite] = useState(bloc.date_limite ?? "");
  const [sauvegarde, setSauvegarde] = useState(false);
  const [enregistrementBiblio, setEnregistrementBiblio] = useState(false);
  const [confirmeSuppr, setConfirmeSuppr] = useState(false);
  const [messageSucces, setMessageSucces] = useState("");

  const estRessource = bloc.type === "ressource" || bloc.type === "media";

  async function sauvegarder() {
    setSauvegarde(true);
    const dateFinale = periodicite === "semaine" ? lundiDeSemaine(semaineAssignation) : dateAssignation;
    await supabase.from("plan_travail").update({
      titre,
      periodicite,
      date_assignation: dateFinale,
      date_limite: dateLimite || null,
    }).eq("id", bloc.id);
    setSauvegarde(false);
    setMessageSucces("Enregistré");
    setTimeout(() => { setMessageSucces(""); onSaved(); }, 1200);
  }

  async function supprimer() {
    await fetch("/api/supprimer-plan-travail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [bloc.id] }),
    });
    onDeleted();
  }

  async function enregistrerBiblio() {
    setEnregistrementBiblio(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setEnregistrementBiblio(false); return; }

    const contenu = (bloc.contenu ?? {}) as Record<string, unknown>;
    const taches = contenu?.taches as { sous_type?: string }[] | undefined;
    const premierSousType = taches?.[0]?.sous_type ?? (contenu?.sous_type as string) ?? "ressource";

    const res = await fetch("/api/bibliotheque-ressources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enseignant_id: user.id,
        titre: bloc.titre,
        sous_type: premierSousType,
        contenu,
        matiere: (contenu?.matiere as string) ?? null,
      }),
    });
    setEnregistrementBiblio(false);
    if (res.ok) {
      setMessageSucces("Enregistré dans la bibliothèque !");
      setTimeout(() => setMessageSucces(""), 3000);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 14px", background: "var(--primary-pale)", borderRadius: 10, border: "1.5px solid var(--primary)" }}>

      {messageSucces && (
        <div style={{ background: "#D1FAE5", color: "#065F46", padding: "8px 12px", borderRadius: 6, fontWeight: 600, fontSize: 12 }}>
          {messageSucces}
        </div>
      )}

      {/* Titre */}
      <div>
        <label style={labelStyle}>Titre</label>
        <input type="text" value={titre} onChange={(e) => setTitre(e.target.value)} className="form-input" style={{ marginBottom: 0, fontSize: 13 }} />
      </div>

      {/* Planification */}
      <div>
        <label style={labelStyle}>Planification</label>
        <div style={{ display: "flex", gap: 6 }}>
          {(["jour", "semaine"] as const).map((p) => (
            <button key={p} type="button" onClick={() => setPeriodicite(p)} style={{
              flex: 1, padding: "6px 8px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: "var(--font)",
              fontWeight: periodicite === p ? 700 : 500,
              background: periodicite === p ? "var(--primary)" : "white",
              color: periodicite === p ? "white" : "var(--text-secondary)",
              border: periodicite === p ? "none" : "1px solid var(--border)",
            }}>
              {p === "jour" ? <><span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>calendar_today</span> Jour</> : <><span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>date_range</span> Semaine</>}
            </button>
          ))}
        </div>
      </div>

      {/* Date */}
      <div>
        <label style={labelStyle}>{periodicite === "jour" ? "Date d'assignation" : "Semaine"}</label>
        {periodicite === "jour" ? (
          <input type="date" value={dateAssignation} onChange={(e) => setDateAssignation(e.target.value)} className="form-input" style={{ marginBottom: 0, fontSize: 13 }} />
        ) : (
          <input type="week" value={semaineAssignation} onChange={(e) => setSemaineAssignation(e.target.value)} className="form-input" style={{ marginBottom: 0, fontSize: 13 }} />
        )}
      </div>

      {/* Date limite */}
      <div>
        <label style={labelStyle}>Date limite <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optionnel)</span></label>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="date" value={dateLimite} onChange={(e) => setDateLimite(e.target.value)} className="form-input" style={{ marginBottom: 0, flex: 1, fontSize: 13 }} />
          {dateLimite && (
            <button onClick={() => setDateLimite("")} style={{ padding: "6px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "white", cursor: "pointer", fontSize: 12, color: "var(--text-secondary)" }}>✕</button>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn-primary" onClick={sauvegarder} disabled={sauvegarde || !titre.trim()} style={{ flex: 1, padding: "7px 10px", fontSize: 12 }}>
          {sauvegarde ? "…" : <><span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>save</span> Enregistrer</>}
        </button>
        {!confirmeSuppr ? (
          <button onClick={() => setConfirmeSuppr(true)} style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid #FCA5A5", background: "#FFF1F2", color: "#DC2626", cursor: "pointer", fontSize: 12, fontFamily: "var(--font)" }}>
            <span className="ms" style={{ fontSize: 16 }}>delete</span>
</button>
        ) : (
          <>
            <button onClick={supprimer} style={{ padding: "7px 10px", borderRadius: 6, background: "#DC2626", color: "white", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "var(--font)" }}>Supprimer ?</button>
            <button onClick={() => setConfirmeSuppr(false)} style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "white", cursor: "pointer", fontSize: 12, fontFamily: "var(--font)" }}>Annuler</button>
          </>
        )}
      </div>

      {/* Bibliothèque */}
      {estRessource && (
        <button onClick={enregistrerBiblio} disabled={enregistrementBiblio} style={{
          width: "100%", padding: "7px 10px", borderRadius: 6, cursor: "pointer", fontFamily: "var(--font)",
          background: "white", color: "var(--primary)",
          border: "1.5px dashed var(--primary)", fontWeight: 600, fontSize: 12,
        }}>
          {enregistrementBiblio ? "Enregistrement…" : <><span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>library_books</span> Enregistrer dans la bibliothèque</>}
        </button>
      )}
    </div>
  );
}

// ── Ligne d'un bloc ───────────────────────────────────────────────────────────

function BlocLigne({
  bloc,
  today,
  eleveId,
  ouvert,
  onToggle,
  onSaved,
  onDeleted,
}: {
  bloc: BlocTravail;
  today: string;
  eleveId: string;
  ouvert: boolean;
  onToggle: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const cfg = TYPE_BLOC_CONFIG[bloc.type] ?? { icone: "assignment", libelle: bloc.type, couleur: "#6B7280" };
  const enRetard = bloc.statut !== "fait" && bloc.date_limite && bloc.date_limite < today;
  const statutEffectif = enRetard ? "a_faire" : bloc.statut;
  const statutCfg = STATUT_BLOC_CONFIG[statutEffectif] ?? STATUT_BLOC_CONFIG.a_faire;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        className="card"
        onClick={onToggle}
        style={{
          padding: "10px 14px", display: "flex", alignItems: "center", gap: 10,
          cursor: "pointer",
          border: ouvert ? "1.5px solid var(--primary)" : "1.5px solid var(--border)",
          backgroundColor: ouvert ? "var(--primary-pale)" : "var(--white)",
          transition: "all 0.15s",
        }}
        onMouseEnter={(e) => { if (!ouvert) (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = ""; }}
      >
        <span className="ms" style={{ fontSize: 16, lineHeight: 1, flexShrink: 0, color: cfg.couleur }}>{cfg.icone}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {bloc.titre}
          </div>
        </div>
        <span className={`badge ${enRetard ? "badge-error" : statutCfg.classe}`} style={{ flexShrink: 0, fontSize: 11 }}>
          {enRetard ? "En retard" : statutCfg.libelle}
        </span>
        <span style={{ fontSize: 14, color: "var(--primary)", flexShrink: 0, transition: "transform 0.15s", transform: ouvert ? "rotate(90deg)" : "none" }}>›</span>
      </div>

      {ouvert && (
        <BlocEditeur
          bloc={bloc}
          today={today}
          eleveId={eleveId}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
}

// ── Panneau principal ─────────────────────────────────────────────────────────

export default function ElevePanel({ eleveId, prenom, onClose, inline = false }: ElevePanelProps) {
  const [onglet, setOnglet] = useState<"aujourd_hui" | "cette_semaine">("aujourd_hui");
  const [blocs, setBlocs] = useState<BlocTravail[]>([]);
  const [chargement, setChargement] = useState(false);
  const [blocOuvert, setBlocOuvert] = useState<string | null>(null);

  const today = dateLocale(new Date());

  const chargerBlocs = useCallback(async (id: string) => {
    setChargement(true);
    setBlocOuvert(null);
    const debut = getLundiStr();
    const fin = getDimancheStr();
    const res = await fetch(
      `/api/plan-travail-eleve?eleveId=${encodeURIComponent(id)}&debut=${debut}&fin=${fin}`
    ).then((r) => r.json()).catch(() => ({ blocs: [] }));
    setBlocs((res.blocs ?? []) as BlocTravail[]);
    setChargement(false);
  }, []);

  useEffect(() => {
    if (!eleveId) return;
    setOnglet("aujourd_hui");
    chargerBlocs(eleveId);
  }, [eleveId, chargerBlocs]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!eleveId) return null;

  const blocsAujourdHui = blocs.filter((b) => b.date_assignation === today);
  const parJour: Record<string, BlocTravail[]> = {};
  blocs.forEach((b) => {
    if (!parJour[b.date_assignation]) parJour[b.date_assignation] = [];
    parJour[b.date_assignation].push(b);
  });

  function renderBlocs(liste: BlocTravail[]) {
    return liste.map((bloc) => (
      <BlocLigne
        key={bloc.id}
        bloc={bloc}
        today={today}
        eleveId={eleveId!}
        ouvert={blocOuvert === bloc.id}
        onToggle={() => setBlocOuvert((prev) => prev === bloc.id ? null : bloc.id)}
        onSaved={() => { setBlocOuvert(null); chargerBlocs(eleveId!); }}
        onDeleted={() => chargerBlocs(eleveId!)}
      />
    ));
  }

  const Wrapper = ({ children }: { children: React.ReactNode }) => inline ? (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", backgroundColor: "var(--white)" }}>
      {children}
    </div>
  ) : (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 200, backdropFilter: "blur(2px)" }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(440px, 100vw)", backgroundColor: "var(--white)", boxShadow: "-8px 0 40px rgba(0,0,0,0.12)", zIndex: 201, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {children}
      </div>
    </>
  );

  return (
    <Wrapper>
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1 }}>

        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, flexShrink: 0, backgroundColor: "var(--bg)" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", backgroundColor: "#DBEAFE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
            👦
          </div>
          <div style={{ flex: 1 }}>
            <div className="text-xs text-secondary" style={{ fontWeight: 600 }}>Élève</div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{prenom}</h2>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ width: 36, height: 36, borderRadius: "50%", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>×</button>
        </div>

        {/* Onglets */}
        <div className="tabs" style={{ padding: "0 24px", borderBottom: "1px solid var(--border)", marginBottom: 0, flexShrink: 0 }}>
          {([
            { cle: "aujourd_hui", label: "Aujourd'hui" },
            { cle: "cette_semaine", label: "Cette semaine" },
          ] as const).map(({ cle, label }) => (
            <button key={cle} className={`tab${onglet === cle ? " active" : ""}`} onClick={() => { setOnglet(cle); setBlocOuvert(null); }}>
              {label}
            </button>
          ))}
        </div>

        {/* Corps */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          {chargement ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 52, borderRadius: 10 }} />)}
            </div>
          ) : onglet === "aujourd_hui" ? (
            blocsAujourdHui.length === 0 ? (
              <div className="empty-state" style={{ padding: "32px 0" }}>
                <div className="empty-state-icon"><span className="ms" style={{ fontSize: 36 }}>inbox</span></div>
                <p>Aucun exercice prévu aujourd'hui.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {renderBlocs(blocsAujourdHui)}
              </div>
            )
          ) : (
            Object.keys(parJour).length === 0 ? (
              <div className="empty-state" style={{ padding: "32px 0" }}>
                <div className="empty-state-icon"><span className="ms" style={{ fontSize: 36 }}>inbox</span></div>
                <p>Aucun exercice cette semaine.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {Object.keys(parJour).sort().map((date) => {
                  const estAujourdHui = date === today;
                  const estPasse = date < today;
                  return (
                    <div key={date}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: estAujourdHui ? "var(--primary)" : "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, opacity: estPasse && !estAujourdHui ? 0.6 : 1 }}>
                        {estAujourdHui && <><span className="ms" style={{ fontSize: 11, verticalAlign: "middle", color: "#2563EB" }}>circle</span>{" "}</>}{formatDateLabel(date, today)}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, opacity: estPasse && !estAujourdHui ? 0.65 : 1 }}>
                        {renderBlocs(parJour[date])}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>
    </Wrapper>
  );
}
