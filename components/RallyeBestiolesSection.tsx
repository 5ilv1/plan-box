"use client";

import { useEffect, useState } from "react";

/**
 * Interrupteur du Rallye Bestioles (réglage `rallye_bestioles`). Activé, le
 * rallye prend la place des podcasts sur le tableau de bord élève.
 */
export default function RallyeBestiolesSection() {
  const [actif, setActif] = useState<boolean | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/enseignant/reglages")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setActif(j ? j.rallye_bestioles === true : false))
      .catch(() => setActif(false));
  }, []);

  async function basculer() {
    if (actif === null) return;
    const valeur = !actif;
    setEnCours(true);
    setMessage(null);
    try {
      const r = await fetch("/api/enseignant/reglages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cle: "rallye_bestioles", valeur }),
      });
      if (!r.ok) throw new Error();
      setActif(valeur);
      setMessage(valeur ? "✓ Ouvert — les podcasts laissent la place au rallye" : "✓ Fermé — les élèves retrouvent leurs podcasts");
    } catch {
      setMessage("Impossible d'enregistrer. Réessaie.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section style={{ background: "white", borderRadius: "1.25rem", padding: "24px 28px", border: "1px solid var(--pb-outline-variant)", boxShadow: "0 1px 4px rgba(0,0,48,0.05)" }}>
      <h3 className="ens-section-title" style={{ marginBottom: 6 }}>
        <span className="ms" style={{ fontSize: 20, verticalAlign: "middle", marginRight: 8 }}>pets</span>
        Rallye Bestioles
      </h3>
      <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", marginBottom: 20, lineHeight: 1.5 }}>
        L&apos;élève choisit un podcast <strong>Bestioles</strong> parmi trois tirés au hasard, l&apos;écoute sur le site
        de France Inter puis répond à un QCM de 5 questions (1 point par bonne réponse) — autant de podcasts qu&apos;il
        veut. Un podcast joué n&apos;est plus proposé. Score, score cumulé et classement de la classe à la fin. Tant que le rallye est
        ouvert, il <strong>remplace les podcasts</strong> sur le tableau de bord.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <button
          type="button"
          role="switch"
          aria-checked={actif === true}
          onClick={basculer}
          disabled={actif === null || enCours}
          style={{
            width: 52, height: 30, borderRadius: 999, border: "none", position: "relative",
            background: actif ? "var(--pb-primary)" : "var(--pb-outline-variant)",
            cursor: actif === null || enCours ? "default" : "pointer", transition: "background 0.15s", flexShrink: 0,
          }}
        >
          <span style={{
            position: "absolute", top: 3, left: actif ? 25 : 3, width: 24, height: 24, borderRadius: "50%",
            background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.25)", transition: "left 0.15s",
          }} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 700 }}>
          {actif === null ? "Chargement…" : actif ? "Ouvert" : "Fermé"}
        </span>
        {message && (
          <span style={{ fontSize: 13, fontWeight: 600, color: message.startsWith("✓") ? "#16A34A" : "#DC2626" }}>{message}</span>
        )}
      </div>
    </section>
  );
}
