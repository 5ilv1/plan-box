"use client";

import { useCallback, useEffect, useState } from "react";

interface Mot {
  id: string;
  mot: string;
  mot_normalise: string;
  actif: boolean;
  derniere_sortie: string | null;
}

interface ResultatEleve {
  uid: string;
  nom: string;
  source: "planbox" | "repetibox";
  nb_essais: number;
  trouve: boolean;
  termine: boolean;
}

interface JourHistorique {
  date: string;
  mot: string;
  total: number;
  trouves: number;
}

interface EtatJour {
  date: string;
  essais_max: number;
  mot: string | null;
  mot_id: string | null;
  aucun_mot: boolean;
  resultats: ResultatEleve[];
  historique: JourHistorique[];
}

const sectionStyle: React.CSSProperties = {
  background: "white",
  borderRadius: "1.25rem",
  padding: "24px 28px",
  border: "1px solid var(--border)",
  boxShadow: "0 1px 4px rgba(0,0,48,0.05)",
};

function formatDate(iso: string): string {
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a.slice(2)}`;
}

export default function MotusEnseignantPage() {
  const [jour, setJour] = useState<EtatJour | null>(null);
  const [mots, setMots] = useState<Mot[]>([]);
  const [chargement, setChargement] = useState(true);
  const [ajout, setAjout] = useState("");
  const [msg, setMsg] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [filtre, setFiltre] = useState("");

  const rechargerMots = useCallback(async () => {
    const json = await fetch("/api/motus/mots").then((r) => r.json());
    if (Array.isArray(json?.mots)) setMots(json.mots);
  }, []);

  const rechargerJour = useCallback(async () => {
    const json = await fetch("/api/motus/teacher").then((r) => r.json());
    if (!json?.erreur) setJour(json);
  }, []);

  useEffect(() => {
    Promise.all([rechargerJour(), rechargerMots()]).finally(() => setChargement(false));
  }, [rechargerJour, rechargerMots]);

  async function ajouterMots() {
    if (!ajout.trim() || occupe) return;
    setOccupe(true);
    setMsg("");
    try {
      const json = await fetch("/api/motus/mots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mots: ajout }),
      }).then((r) => r.json());

      const parts: string[] = [];
      if (json.ajoutes) parts.push(`${json.ajoutes} mot${json.ajoutes > 1 ? "s" : ""} ajouté${json.ajoutes > 1 ? "s" : ""}`);
      if (json.doublons) parts.push(`${json.doublons} déjà dans la liste`);
      if (json.refuses?.length) {
        parts.push(
          `refusé${json.refuses.length > 1 ? "s" : ""} : ` +
            json.refuses.map((r: { mot: string; raison: string }) => `${r.mot} (${r.raison})`).join(", "),
        );
      }
      setMsg(parts.join(" · ") || "Rien à ajouter.");
      setAjout("");
      await rechargerMots();
    } finally {
      setOccupe(false);
    }
  }

  async function basculerActif(m: Mot) {
    setMots((prev) => prev.map((x) => (x.id === m.id ? { ...x, actif: !x.actif } : x)));
    await fetch("/api/motus/mots", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m.id, actif: !m.actif }),
    });
  }

  async function supprimer(m: Mot) {
    if (!confirm(`Supprimer « ${m.mot} » de la liste ?`)) return;
    setMots((prev) => prev.filter((x) => x.id !== m.id));
    await fetch("/api/motus/mots", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m.id }),
    });
  }

  async function changerMotDuJour(motId?: string) {
    const avertissement =
      "Changer le mot du jour efface les parties déjà jouées aujourd'hui. Continuer ?";
    if (!confirm(avertissement)) return;
    setOccupe(true);
    setMsg("");
    try {
      const json = await fetch("/api/motus/teacher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(motId ? { mot_id: motId } : {}),
      }).then((r) => r.json());
      if (json?.erreur) setMsg(json.erreur);
      else setMsg(`Nouveau mot du jour : ${json.mot}`);
      await Promise.all([rechargerJour(), rechargerMots()]);
    } finally {
      setOccupe(false);
    }
  }

  const motsFiltres = filtre
    ? mots.filter((m) => m.mot_normalise.includes(filtre.toUpperCase()))
    : mots;
  const nbActifs = mots.filter((m) => m.actif).length;
  const nbTrouve = jour?.resultats.filter((r) => r.trouve).length ?? 0;

  return (
    <>
      <h2 className="ens-page-title">Motus</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 32, marginTop: 24 }}>

        {/* ── Mot du jour ── */}
        <section style={sectionStyle}>
          <h3 className="ens-section-title" style={{ marginBottom: 6 }}>
            <span className="ms" style={{ fontSize: 20, verticalAlign: "middle", marginRight: 8 }}>grid_view</span>
            Mot du jour
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
            Un mot est tiré chaque jour, week-ends et vacances compris, parmi les mots actifs
            les moins récemment sortis.
          </p>

          {chargement ? (
            <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Chargement&hellip;</p>
          ) : jour?.aucun_mot || !jour?.mot ? (
            <p style={{ fontSize: 14, color: "#B45309" }}>
              Aucun mot actif dans la liste : les élèves ne voient pas le jeu. Ajoute des mots ci-dessous.
            </p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                  {jour.mot.split("").map((l, i) => (
                    <span
                      key={i}
                      style={{
                        width: 34, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
                        background: "#141414", color: "#fff", borderRadius: 4,
                        fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 18,
                      }}
                    >
                      {l}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  {formatDate(jour.date)} · {jour.mot.length} lettres · {jour.essais_max} essais
                </div>
                <button
                  className="btn-secondary"
                  disabled={occupe}
                  onClick={() => changerMotDuJour()}
                  style={{ marginTop: 14 }}
                >
                  Changer le mot du jour
                </button>
              </div>

              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                  {jour.resultats.length === 0
                    ? "Personne n'a encore joué aujourd'hui."
                    : `${nbTrouve} trouvé${nbTrouve > 1 ? "s" : ""} sur ${jour.resultats.length} joueur${jour.resultats.length > 1 ? "s" : ""}`}
                </div>
                {jour.resultats.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {jour.resultats.map((r) => (
                      <div
                        key={r.uid}
                        style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "7px 12px", borderRadius: 10, background: "var(--bg)",
                          fontSize: 13,
                        }}
                      >
                        <span>{r.nom}</span>
                        <span style={{ fontWeight: 700, color: r.trouve ? "#16A34A" : r.termine ? "#C0473C" : "var(--text-secondary)" }}>
                          {r.trouve
                            ? `trouvé en ${r.nb_essais}`
                            : r.termine
                              ? "pas trouvé"
                              : `${r.nb_essais} essai${r.nb_essais > 1 ? "s" : ""}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ── Liste de mots ── */}
        <section style={sectionStyle}>
          <h3 className="ens-section-title" style={{ marginBottom: 6 }}>
            <span className="ms" style={{ fontSize: 20, verticalAlign: "middle", marginRight: 8 }}>spellcheck</span>
            Liste de mots
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
            {nbActifs} mot{nbActifs > 1 ? "s" : ""} actif{nbActifs > 1 ? "s" : ""} sur {mots.length}.
            Les accents sont acceptés à la saisie mais ignorés dans le jeu ; les mots font
            de 4 à 10 lettres.
          </p>

          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 8 }}>
            <textarea
              value={ajout}
              onChange={(e) => setAjout(e.target.value)}
              placeholder="requin, montagne, chocolat…"
              rows={3}
              style={{
                flex: 1, minWidth: 260, padding: "10px 14px", borderRadius: "0.75rem",
                border: "1px solid var(--border)", fontFamily: "inherit", fontSize: 14, resize: "vertical",
              }}
            />
            <button className="btn-primary" onClick={ajouterMots} disabled={occupe || !ajout.trim()}>
              Ajouter
            </button>
          </div>
          {msg && (
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>{msg}</p>
          )}

          <input
            value={filtre}
            onChange={(e) => setFiltre(e.target.value)}
            placeholder="Filtrer…"
            style={{
              padding: "8px 14px", borderRadius: "0.75rem", border: "1px solid var(--border)",
              fontFamily: "inherit", fontSize: 13, marginBottom: 12, maxWidth: 220,
            }}
          />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
            {motsFiltres.map((m) => (
              <div
                key={m.id}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                  padding: "8px 12px", borderRadius: 10,
                  background: m.actif ? "var(--bg)" : "transparent",
                  border: "1px solid var(--border)",
                  opacity: m.actif ? 1 : 0.55,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{m.mot_normalise}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    {m.derniere_sortie ? `sorti le ${formatDate(m.derniere_sortie)}` : "jamais sorti"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button
                    className="btn-ghost"
                    title={m.actif ? "Désactiver" : "Activer"}
                    onClick={() => basculerActif(m)}
                    style={{ padding: "4px 8px" }}
                  >
                    <span className="ms" style={{ fontSize: 18 }}>
                      {m.actif ? "toggle_on" : "toggle_off"}
                    </span>
                  </button>
                  <button
                    className="btn-ghost"
                    title="Utiliser aujourd'hui"
                    onClick={() => changerMotDuJour(m.id)}
                    disabled={occupe || m.id === jour?.mot_id}
                    style={{ padding: "4px 8px" }}
                  >
                    <span className="ms" style={{ fontSize: 18 }}>today</span>
                  </button>
                  <button
                    className="btn-ghost"
                    title="Supprimer"
                    onClick={() => supprimer(m)}
                    style={{ padding: "4px 8px", color: "#C0473C" }}
                  >
                    <span className="ms" style={{ fontSize: 18 }}>delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Historique ── */}
        {jour && jour.historique.length > 0 && (
          <section style={sectionStyle}>
            <h3 className="ens-section-title" style={{ marginBottom: 6 }}>
              <span className="ms" style={{ fontSize: 20, verticalAlign: "middle", marginRight: 8 }}>history</span>
              Ces deux dernières semaines
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 16 }}>
              {jour.historique.map((h) => (
                <div
                  key={h.date}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 12px", borderRadius: 10, background: "var(--bg)", fontSize: 13,
                  }}
                >
                  <span style={{ color: "var(--text-secondary)", width: 70 }}>{formatDate(h.date)}</span>
                  <span style={{ fontWeight: 700, letterSpacing: "0.06em" }}>{h.mot}</span>
                  <span style={{ color: "var(--text-secondary)" }}>
                    {h.total === 0 ? "—" : `${h.trouves}/${h.total} trouvé${h.trouves > 1 ? "s" : ""}`}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
