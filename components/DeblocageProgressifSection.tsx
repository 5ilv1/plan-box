"use client";

import { useEffect, useState } from "react";

/**
 * Interrupteur du déblocage progressif du tableau de bord élève
 * (lib/deblocage-eleve.ts). Désactivé, les élèves voient tout, comme avant.
 */
export default function DeblocageProgressifSection() {
  const [actif, setActif] = useState<boolean | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/enseignant/reglages")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setActif(j ? j.deblocage_progressif === true : false))
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
        body: JSON.stringify({ cle: "deblocage_progressif", valeur }),
      });
      if (!r.ok) throw new Error();
      setActif(valeur);
      setMessage(valeur ? "✓ Activé — pris en compte à la prochaine ouverture du tableau de bord" : "✓ Désactivé — les élèves voient tout");
    } catch {
      setMessage("Impossible d'enregistrer. Réessaie.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section style={{ background: "white", borderRadius: "1.25rem", padding: "24px 28px", border: "1px solid var(--ens-outline-variant)", boxShadow: "0 1px 4px rgba(0,0,48,0.05)" }}>
      <h3 className="ens-section-title" style={{ marginBottom: 6 }}>
        <span className="ms" style={{ fontSize: 20, verticalAlign: "middle", marginRight: 8 }}>lock_open_right</span>
        Déblocage progressif du tableau de bord élève
      </h3>
      <p style={{ fontSize: 13, color: "var(--ens-on-surface-variant)", marginBottom: 12, lineHeight: 1.5 }}>
        L&apos;élève ne voit d&apos;abord que son <strong>travail du jour</strong> (avec le problème et le calcul du jour).
        Quand sa barre du jour est pleine, ses <strong>exercices en retard</strong> apparaissent. Une fois ceux des
        7 derniers jours rattrapés, <strong>tout le reste</strong> se débloque : podcasts, ceintures, lecture, Motus,
        cartes Repetibox.
      </p>
      <p style={{ fontSize: 12, color: "var(--ens-on-surface-variant)", marginBottom: 20, lineHeight: 1.5 }}>
        Un atelier d&apos;écriture de la semaine compte dès que l&apos;élève y a écrit aujourd&apos;hui. Les retards de plus
        de 7 jours restent visibles mais ne bloquent pas.
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
            background: actif ? "var(--ens-primary)" : "var(--ens-outline-variant)",
            cursor: actif === null || enCours ? "default" : "pointer", transition: "background 0.15s", flexShrink: 0,
          }}
        >
          <span style={{
            position: "absolute", top: 3, left: actif ? 25 : 3, width: 24, height: 24, borderRadius: "50%",
            background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.25)", transition: "left 0.15s",
          }} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 700 }}>
          {actif === null ? "Chargement…" : actif ? "Activé" : "Désactivé"}
        </span>
        {message && (
          <span style={{ fontSize: 13, fontWeight: 600, color: message.startsWith("✓") ? "#16A34A" : "#DC2626" }}>{message}</span>
        )}
      </div>
    </section>
  );
}
