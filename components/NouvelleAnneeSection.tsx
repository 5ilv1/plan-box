"use client";

import { useEffect, useState } from "react";
import {
  CONFIRMATION_ATTENDUE,
  OPTIONS_CONTENUS,
  type CleOptionContenu,
} from "@/lib/nouvelle-annee";

interface LigneTravail {
  table: string;
  label: string;
  nb: number;
}

interface Apercu {
  travail: LigneTravail[];
  total: number;
  contenus: Record<CleOptionContenu, number>;
}

const ROUGE = "#DC2626";

/**
 * Zone « Changer d'année » : efface tout le travail des élèves de l'année
 * écoulée pour repartir d'une page blanche, en conservant les contenus créés
 * par l'enseignant (chapitres, livres, leçons, podcasts, banques).
 */
export default function NouvelleAnneeSection() {
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [chargement, setChargement] = useState(true);
  const [ouvert, setOuvert] = useState(false);
  const [contenus, setContenus] = useState<CleOptionContenu[]>([]);
  const [confirmation, setConfirmation] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<string>("");
  const [erreur, setErreur] = useState<string>("");

  async function chargerApercu() {
    setChargement(true);
    try {
      const res = await fetch("/api/admin/nouvelle-annee");
      if (res.ok) setApercu(await res.json());
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => { chargerApercu(); }, []);

  function basculerContenu(cle: CleOptionContenu) {
    setContenus((prev) =>
      prev.includes(cle) ? prev.filter((c) => c !== cle) : [...prev, cle]);
  }

  async function lancerRemiseAZero() {
    setEnCours(true);
    setErreur("");
    setResultat("");

    const res = await fetch("/api/admin/nouvelle-annee", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation, contenus }),
    });
    const json = await res.json().catch(() => ({}));
    setEnCours(false);

    if (!res.ok) {
      setErreur(json.erreur ?? "Erreur lors de la remise à zéro");
      return;
    }

    const total = Object.values(json.supprime as Record<string, number>)
      .reduce((s, n) => s + n, 0);
    setResultat(`✓ Année remise à zéro — ${total} élément${total > 1 ? "s" : ""} supprimé${total > 1 ? "s" : ""}.`);
    setConfirmation("");
    setContenus([]);
    setOuvert(false);
    chargerApercu();
  }

  const confirmationOk = confirmation.trim().toUpperCase() === CONFIRMATION_ATTENDUE;

  return (
    <section style={{
      background: "white", borderRadius: "1.25rem", padding: "24px 28px",
      border: `1px solid ${ouvert ? "#FECACA" : "var(--ens-outline-variant)"}`,
      boxShadow: "0 1px 4px rgba(0,0,48,0.05)",
    }}>
      <h3 className="ens-section-title" style={{ marginBottom: 6 }}>
        <span className="ms" style={{ fontSize: 20, verticalAlign: "middle", marginRight: 8 }}>restart_alt</span>
        Changer d'année
      </h3>
      <p style={{ fontSize: 13, color: "var(--ens-on-surface-variant)", marginBottom: 20 }}>
        Efface tout le travail des élèves de l'année écoulée — blocs assignés, résultats,
        progressions, podcasts et lectures en cours — pour que le tableau de bord élève
        reparte vide. Les contenus que vous avez créés (chapitres, exercices, livres,
        leçons, podcasts, banques) sont conservés, ainsi que les ceintures de
        multiplication et l'ensemble des données Repetibox.
      </p>

      {chargement ? (
        <p style={{ color: "var(--ens-on-surface-variant)", fontSize: 13 }}>Chargement…</p>
      ) : !apercu ? (
        <p style={{ color: ROUGE, fontSize: 13 }}>Aperçu indisponible.</p>
      ) : apercu.total === 0 && !ouvert ? (
        <p style={{ fontSize: 13, fontWeight: 600, color: "#16A34A" }}>
          ✓ Aucun travail élève en base — l'année est déjà à zéro.
        </p>
      ) : (
        <>
          {/* Aperçu de ce qui sera effacé */}
          <div style={{
            display: "flex", flexDirection: "column", gap: 6, marginBottom: 20,
            padding: "14px 16px", borderRadius: "0.75rem",
            background: "var(--ens-surface-container-low)",
            border: "1px solid var(--ens-outline-variant)",
          }}>
            {apercu.travail.filter((l) => l.nb > 0).map((l) => (
              <div key={l.table} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "var(--ens-on-surface-variant)" }}>{l.label}</span>
                <span style={{ fontWeight: 700, color: "var(--ens-on-surface)" }}>{l.nb}</span>
              </div>
            ))}
            <div style={{
              display: "flex", justifyContent: "space-between", fontSize: 13,
              borderTop: "1px solid var(--ens-outline-variant)", paddingTop: 6, marginTop: 2,
            }}>
              <span style={{ fontWeight: 700 }}>Total</span>
              <span style={{ fontWeight: 700, color: ROUGE }}>{apercu.total}</span>
            </div>
          </div>

          {!ouvert ? (
            <button
              onClick={() => setOuvert(true)}
              style={{
                padding: "10px 20px", borderRadius: "0.75rem",
                border: `1.5px solid ${ROUGE}`, background: "white",
                color: ROUGE, fontWeight: 700, fontSize: 14, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 8,
              }}
            >
              <span className="ms" style={{ fontSize: 18 }}>restart_alt</span>
              Changer d'année…
            </button>
          ) : (
            <div style={{
              padding: "18px 20px", borderRadius: "0.75rem",
              background: "#FEF2F2", border: "1px solid #FECACA",
            }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: ROUGE, marginBottom: 14 }}>
                Cette action est définitive et ne peut pas être annulée.
              </p>

              <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ens-on-surface-variant)", marginBottom: 8 }}>
                Supprimer aussi ces contenus (facultatif)
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
                {OPTIONS_CONTENUS.map((o) => (
                  <label key={o.cle} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={contenus.includes(o.cle)}
                      onChange={() => basculerContenu(o.cle)}
                      style={{ marginTop: 2, accentColor: ROUGE }}
                    />
                    <span>
                      <strong>{o.label}</strong>{" "}
                      <span style={{ color: "var(--ens-on-surface-variant)" }}>
                        ({apercu.contenus[o.cle]}) — {o.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              <label style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ens-on-surface-variant)", display: "block", marginBottom: 6 }}>
                Saisissez « {CONFIRMATION_ATTENDUE} » pour confirmer
              </label>
              <input
                type="text"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder={CONFIRMATION_ATTENDUE}
                style={{
                  padding: "9px 14px", borderRadius: "0.75rem",
                  border: `1.5px solid ${confirmationOk ? "#16A34A" : "#FECACA"}`,
                  fontSize: 13, fontFamily: "inherit", background: "white",
                  color: "var(--ens-on-surface)", outline: "none", width: 260,
                  marginBottom: 16, display: "block",
                }}
              />

              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  onClick={lancerRemiseAZero}
                  disabled={!confirmationOk || enCours}
                  style={{
                    padding: "10px 20px", borderRadius: "0.75rem", border: "none",
                    background: confirmationOk && !enCours ? ROUGE : "#FCA5A5",
                    color: "white", fontWeight: 700, fontSize: 14,
                    cursor: confirmationOk && !enCours ? "pointer" : "not-allowed",
                  }}
                >
                  {enCours ? "Remise à zéro…" : "Tout remettre à zéro"}
                </button>
                <button
                  onClick={() => { setOuvert(false); setConfirmation(""); setErreur(""); }}
                  disabled={enCours}
                  style={{
                    padding: "10px 20px", borderRadius: "0.75rem",
                    border: "1.5px solid var(--ens-outline-variant)", background: "white",
                    color: "var(--ens-on-surface-variant)", fontWeight: 600, fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {resultat && (
        <p style={{ fontSize: 13, fontWeight: 700, color: "#16A34A", marginTop: 16 }}>{resultat}</p>
      )}
      {erreur && (
        <p style={{ fontSize: 13, fontWeight: 700, color: ROUGE, marginTop: 16 }}>{erreur}</p>
      )}
    </section>
  );
}
