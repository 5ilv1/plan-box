"use client";

import { useEffect, useState } from "react";

type OperationCalcul = "addition" | "soustraction" | "multiplication" | "division";

interface NiveauConfig {
  id?: string;
  niveau_id: string;
  niveau_nom?: string;
  operations: OperationCalcul[];
  decimales: boolean;
  decimales_mode: "aucun" | "premier_nombre" | "les_deux";
  nb_decimales: number;
  nombre_min: number;
  nombre_max: number;
  nombre2_min: number;
  nombre2_max: number;
  actif: boolean;
}

interface CalculDuJour {
  id: string;
  date: string;
  niveau_id: string;
  operation: OperationCalcul;
  nombre1: number;
  nombre2: number;
  reponse: number;
  niveaux?: { nom: string };
}

interface ResultatEleve {
  id: string;
  calcul_id: string;
  eleve_id: string | null;
  rb_eleve_id: number | null;
  reponse_eleve: number | null;
  correct: boolean;
  tentative: number;
  eleve_nom: string;
  eleve_uid: string;
}

const NIVEAUX_IDS: Record<string, string> = {
  CE2: "11111111-0000-0000-0000-000000000001",
  CM1: "11111111-0000-0000-0000-000000000002",
  CM2: "11111111-0000-0000-0000-000000000003",
};

const NIVEAUX = [
  { key: "CE2", nom: "CE2", badge: "badge-ce2", id: NIVEAUX_IDS.CE2 },
  { key: "CM1", nom: "CM1", badge: "badge-cm1", id: NIVEAUX_IDS.CM1 },
  { key: "CM2", nom: "CM2", badge: "badge-cm2", id: NIVEAUX_IDS.CM2 },
];

const OPS: { key: OperationCalcul; label: string; symbol: string }[] = [
  { key: "addition", label: "Addition", symbol: "+" },
  { key: "soustraction", label: "Soustraction", symbol: "\u2212" },
  { key: "multiplication", label: "Multiplication", symbol: "\u00d7" },
  { key: "division", label: "Division", symbol: "\u00f7" },
];

const defaultConfig = (niveauId: string): NiveauConfig => ({
  niveau_id: niveauId,
  operations: [],
  decimales: false,
  decimales_mode: "aucun",
  nb_decimales: 0,
  nombre_min: 1,
  nombre_max: 100,
  nombre2_min: 1,
  nombre2_max: 100,
  actif: false,
});

function formatOperateur(op: OperationCalcul): string {
  switch (op) {
    case "addition": return "+";
    case "soustraction": return "\u2212";
    case "multiplication": return "\u00d7";
    case "division": return "\u00f7";
    default: return op;
  }
}

export default function CalculDuJourPage() {
  const [configs, setConfigs] = useState<NiveauConfig[]>(
    NIVEAUX.map((n) => defaultConfig(n.id))
  );
  const [calculs, setCalculs] = useState<CalculDuJour[]>([]);
  const [resultats, setResultats] = useState<ResultatEleve[]>([]);
  const [onglet, setOnglet] = useState(NIVEAUX_IDS.CE2);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/calcul-du-jour/config").then((r) => r.json()),
      fetch("/api/calcul-du-jour/teacher").then((r) => r.json()),
    ])
      .then(([cfgData, teacherData]) => {
        // cfgData est un Record<string, config> (CE2, CM1, CM2)
        if (cfgData && typeof cfgData === "object" && !cfgData.error) {
          const cfgArray: NiveauConfig[] = [];
          for (const niv of NIVEAUX) {
            const found = cfgData[niv.key];
            if (found) {
              cfgArray.push({
                ...defaultConfig(niv.id),
                ...found,
              });
            } else {
              cfgArray.push(defaultConfig(niv.id));
            }
          }
          setConfigs(cfgArray);
        }

        // teacherData est { calculs, resultats, configs }
        if (teacherData && !teacherData.error) {
          if (Array.isArray(teacherData.calculs)) {
            setCalculs(teacherData.calculs);
          }
          if (Array.isArray(teacherData.resultats)) {
            setResultats(teacherData.resultats);
          }
        }

        setChargement(false);
      })
      .catch(() => setChargement(false));
  }, []);

  function updateConfig(niveauId: string, patch: Partial<NiveauConfig>) {
    setConfigs((prev) =>
      prev.map((c) => (c.niveau_id === niveauId ? { ...c, ...patch } : c))
    );
  }

  function selectOp(niveauId: string, opKey: OperationCalcul) {
    setConfigs((prev) =>
      prev.map((c) => {
        if (c.niveau_id !== niveauId) return c;
        return { ...c, operations: [opKey] };
      })
    );
  }

  async function sauvegarder(niveauId: string) {
    const cfg = configs.find((c) => c.niveau_id === niveauId);
    if (!cfg) return;
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/calcul-du-jour/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niveau_id: cfg.niveau_id,
          operations: cfg.operations,
          decimales: cfg.decimales_mode !== "aucun",
          decimales_mode: cfg.decimales_mode,
          nb_decimales: cfg.nb_decimales,
          nombre_min: cfg.nombre_min,
          nombre_max: cfg.nombre_max,
          nombre2_min: cfg.nombre2_min,
          nombre2_max: cfg.nombre2_max,
          actif: cfg.actif,
        }),
      });
      if (res.ok) {
        // Régénérer le calcul du jour avec la nouvelle config
        await fetch("/api/calcul-du-jour/teacher/regenerer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ niveau_id: cfg.niveau_id }),
        });
        setMsg("\u2713 Configuration enregistr\u00e9e");
        // Rafraichir les calculs
        const teacherData = await fetch("/api/calcul-du-jour/teacher").then((r) => r.json());
        if (teacherData && !teacherData.error) {
          if (Array.isArray(teacherData.calculs)) setCalculs(teacherData.calculs);
          if (Array.isArray(teacherData.resultats)) setResultats(teacherData.resultats);
        }
      } else {
        setMsg("Erreur lors de la sauvegarde");
      }
    } catch {
      setMsg("Erreur r\u00e9seau");
    }
    setSaving(false);
    setTimeout(() => setMsg(""), 3000);
  }

  const sectionStyle: React.CSSProperties = {
    background: "white",
    borderRadius: "1.25rem",
    padding: "24px 28px",
    border: "1px solid var(--border)",
    boxShadow: "0 1px 4px rgba(0,0,48,0.05)",
  };

  const inputStyle: React.CSSProperties = {
    padding: "9px 14px",
    borderRadius: "0.75rem",
    border: "1.5px solid var(--border)",
    fontSize: 13,
    fontFamily: "inherit",
    background: "white",
    color: "var(--text)",
    outline: "none",
    width: "100%",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text-secondary)",
    marginBottom: 6,
    display: "block",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  const currentCfg = configs.find((c) => c.niveau_id === onglet)!;

  return (
    <>
      <h2 className="ens-page-title">Calcul du Jour</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 32, marginTop: 24 }}>

        {/* Section 1 : Calculs du jour */}
        <section style={sectionStyle}>
          <h3 className="ens-section-title" style={{ marginBottom: 6 }}>
            <span className="ms" style={{ fontSize: 20, verticalAlign: "middle", marginRight: 8 }}>calculate</span>
            Calculs du jour
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
            Aper&ccedil;u des calculs g&eacute;n&eacute;r&eacute;s aujourd&apos;hui pour chaque niveau.
          </p>

          {chargement ? (
            <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Chargement&hellip;</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
              {NIVEAUX.map((niv) => {
                const calcul = calculs.find((c) => c.niveau_id === niv.id);
                const cfg = configs.find((c) => c.niveau_id === niv.id);

                // Compter les resultats pour ce calcul
                const calculResultats = calcul
                  ? resultats.filter((r) => r.calcul_id === calcul.id)
                  : [];
                // Grouper par eleve, prendre le meilleur resultat
                const parEleve = new Map<string, boolean>();
                for (const r of calculResultats) {
                  const key = r.eleve_uid;
                  if (!parEleve.has(key) || r.correct) {
                    parEleve.set(key, r.correct);
                  }
                }
                const nbReussi = [...parEleve.values()].filter(Boolean).length;
                const nbTotal = parEleve.size;

                return (
                  <div
                    key={niv.key}
                    style={{
                      padding: "20px",
                      borderRadius: "1rem",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      textAlign: "center",
                    }}
                  >
                    <span className={niv.badge} style={{ marginBottom: 12, display: "inline-block" }}>
                      {niv.nom}
                    </span>

                    {!cfg?.actif ? (
                      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 12 }}>
                        Pas encore configur&eacute;
                      </p>
                    ) : !calcul ? (
                      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 12 }}>
                        Aucun calcul aujourd&apos;hui
                      </p>
                    ) : (
                      <>
                        <div style={{
                          fontFamily: "'Plus Jakarta Sans', sans-serif",
                          fontSize: 22,
                          fontWeight: 800,
                          color: "var(--text)",
                          margin: "16px 0 12px",
                        }}>
                          {calcul.nombre1} {formatOperateur(calcul.operation)} {calcul.nombre2}
                        </div>
                        <div style={{
                          fontSize: 13,
                          color: "var(--text-secondary)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                        }}>
                          <span className="ms" style={{ fontSize: 16, color: "#16A34A" }}>check_circle</span>
                          {nbReussi} / {nbTotal} &eacute;l&egrave;ves
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Section 2 : Parametrage par niveau */}
        <section style={sectionStyle}>
          <h3 className="ens-section-title" style={{ marginBottom: 6 }}>
            <span className="ms" style={{ fontSize: 20, verticalAlign: "middle", marginRight: 8 }}>tune</span>
            Param&eacute;trage par niveau
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
            Configurez les param&egrave;tres de g&eacute;n&eacute;ration du calcul du jour pour chaque niveau.
          </p>

          {/* Onglets */}
          <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
            {NIVEAUX.map((niv) => (
              <button
                key={niv.key}
                onClick={() => setOnglet(niv.id)}
                style={{
                  padding: "10px 24px",
                  borderRadius: "0.75rem",
                  border: `2px solid ${onglet === niv.id ? "var(--primary)" : "var(--border)"}`,
                  background: onglet === niv.id ? "var(--primary)" : "white",
                  color: onglet === niv.id ? "white" : "var(--text-secondary)",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {niv.nom}
              </button>
            ))}
          </div>

          {/* Formulaire du niveau selectionne */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Operations */}
            <div>
              <label style={labelStyle}>Op&eacute;ration du jour</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {OPS.map((op) => {
                  const checked = currentCfg.operations.includes(op.key);
                  return (
                    <button
                      key={op.key}
                      type="button"
                      onClick={() => selectOp(onglet, op.key)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 18px",
                        borderRadius: "0.75rem",
                        border: `2px solid ${checked ? "var(--primary)" : "var(--border)"}`,
                        background: checked ? "rgba(0, 80, 212, 0.08)" : "white",
                        color: checked ? "var(--primary)" : "var(--text-secondary)",
                        fontWeight: 600,
                        fontSize: 14,
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      <span style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: checked ? "var(--primary)" : "var(--bg)",
                        color: checked ? "white" : "var(--text-secondary)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: 16,
                      }}>
                        {op.symbol}
                      </span>
                      {op.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Nombres decimaux */}
            <div>
              <label style={labelStyle}>Nombres d&eacute;cimaux</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {([
                  { key: "aucun" as const, label: "Non" },
                  { key: "premier_nombre" as const, label: "1er nombre" },
                  { key: "les_deux" as const, label: "Les deux" },
                ]).map((opt) => {
                  const selected = currentCfg.decimales_mode === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => {
                      const patch: Partial<NiveauConfig> = { decimales_mode: opt.key, decimales: opt.key !== "aucun" };
                      if (opt.key !== "aucun" && currentCfg.nb_decimales === 0) patch.nb_decimales = 1;
                      updateConfig(onglet, patch);
                    }}
                      style={{
                        padding: "10px 18px",
                        borderRadius: "0.75rem",
                        border: `2px solid ${selected ? "var(--primary)" : "var(--border)"}`,
                        background: selected ? "var(--primary)" : "white",
                        color: selected ? "white" : "var(--text-secondary)",
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}

                {currentCfg.decimales_mode !== "aucun" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
                    <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                      Chiffres apr&egrave;s la virgule :
                    </span>
                    <select
                      value={currentCfg.nb_decimales}
                      onChange={(e) => updateConfig(onglet, { nb_decimales: Number(e.target.value) })}
                      style={{
                        ...inputStyle,
                        width: 60,
                        padding: "6px 10px",
                      }}
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Intervalle */}
            <div>
              <label style={labelStyle}>1er nombre</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                <div style={{ flex: "1 1 120px", minWidth: 120 }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>Min</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={currentCfg.nombre_min}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, "");
                      updateConfig(onglet, { nombre_min: v === "" ? ("" as any) : Number(v) });
                    }}
                    onBlur={() => { if (currentCfg.nombre_min === ("" as any)) updateConfig(onglet, { nombre_min: 0 }); }}
                    style={inputStyle}
                  />
                </div>
                <span style={{ fontSize: 18, color: "var(--text-secondary)", marginTop: 16 }}>&rarr;</span>
                <div style={{ flex: "1 1 120px", minWidth: 120 }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>Max</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={currentCfg.nombre_max}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, "");
                      updateConfig(onglet, { nombre_max: v === "" ? ("" as any) : Number(v) });
                    }}
                    onBlur={() => { if (currentCfg.nombre_max === ("" as any)) updateConfig(onglet, { nombre_max: 100 }); }}
                    style={inputStyle}
                  />
                </div>
              </div>

              <label style={labelStyle}>2e nombre</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 120px", minWidth: 120 }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>Min</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={currentCfg.nombre2_min}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, "");
                      updateConfig(onglet, { nombre2_min: v === "" ? ("" as any) : Number(v) });
                    }}
                    onBlur={() => { if (currentCfg.nombre2_min === ("" as any)) updateConfig(onglet, { nombre2_min: 0 }); }}
                    style={inputStyle}
                  />
                </div>
                <span style={{ fontSize: 18, color: "var(--text-secondary)", marginTop: 16 }}>&rarr;</span>
                <div style={{ flex: "1 1 120px", minWidth: 120 }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>Max</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={currentCfg.nombre2_max}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, "");
                      updateConfig(onglet, { nombre2_max: v === "" ? ("" as any) : Number(v) });
                    }}
                    onBlur={() => { if (currentCfg.nombre2_max === ("" as any)) updateConfig(onglet, { nombre2_max: 100 }); }}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            {/* Actif */}
            <div>
              <label style={labelStyle}>Activer le calcul du jour</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  type="button"
                  onClick={() => updateConfig(onglet, { actif: !currentCfg.actif })}
                  style={{
                    width: 52,
                    height: 28,
                    borderRadius: 14,
                    border: "none",
                    background: currentCfg.actif ? "#16A34A" : "#ccc",
                    position: "relative",
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                >
                  <div style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: "white",
                    position: "absolute",
                    top: 3,
                    left: currentCfg.actif ? 27 : 3,
                    transition: "left 0.2s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }} />
                </button>
                <span style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: currentCfg.actif ? "#16A34A" : "var(--text-secondary)",
                }}>
                  {currentCfg.actif ? "Actif" : "Inactif"}
                </span>
              </div>
            </div>

            {/* Bouton sauvegarder */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 8 }}>
              <button
                className="ens-btn primary"
                onClick={() => sauvegarder(onglet)}
                disabled={saving}
              >
                {saving ? "Enregistrement\u2026" : "Enregistrer"}
              </button>
              {msg && (
                <span style={{ fontSize: 13, fontWeight: 600, color: msg.startsWith("\u2713") ? "#16A34A" : "#DC2626" }}>
                  {msg}
                </span>
              )}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
