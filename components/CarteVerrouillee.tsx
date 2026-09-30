/**
 * Ce que le déblocage progressif garde fermé (lib/deblocage-eleve.ts) : la
 * carte est montrée grisée, avec un cadenas, et ne mène nulle part.
 *
 * Aucune donnée n'est chargée pour elle — c'est une vignette, pas la vraie
 * carte : l'élève voit ce qui l'attend, et le quota Vercel n'en paie rien.
 */

const MESSAGE = "Se débloque quand ton travail du jour et tes retards sont faits";

export default function CarteVerrouillee({ icone, titre, message = MESSAGE }: { icone: string; titre: string; message?: string }) {
  return (
    <div className="pb-card carte-verrouillee" aria-disabled="true" style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
      <span className="ms" style={{ fontSize: 26, color: "var(--pb-on-surface-variant)", flexShrink: 0 }}>{icone}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 15, fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface)" }}>{titre}</div>
        <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", marginTop: 2 }}>{message}</div>
      </div>
      <span className="ms" style={{ fontSize: 22, color: "var(--pb-on-surface-variant)", flexShrink: 0 }}>lock</span>
    </div>
  );
}

/** Le Motus du jour fermé, aux deux places de la vraie carte (hero / bento). */
export function MotusVerrouille({ variant }: { variant: "hero" | "bento" }) {
  return (
    <div className={`motus-carte motus-carte-${variant} carte-verrouillee`} aria-disabled="true">
      <div className="motus-carte-titre">Motus du jour</div>
      <div className="motus-carte-statut" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span className="ms" style={{ fontSize: 18 }}>lock</span>
        {MESSAGE}
      </div>
    </div>
  );
}
