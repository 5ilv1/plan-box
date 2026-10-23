import Link from "next/link";

/**
 * Carte du Rallye Bestioles sur le tableau de bord élève, à la place des
 * podcasts. Une vignette sans données : le tirage du jour, le score et le
 * classement se chargent sur /eleve/rallye — rien ne coûte d'appel ici, le
 * tableau de bord étant rouvert ~25 fois par séance.
 */
export default function RallyeCarte() {
  return (
    <Link
      href="/eleve/rallye"
      prefetch={false}
      className="pb-card"
      style={{
        display: "block", position: "relative", overflow: "hidden",
        padding: "20px", textDecoration: "none", color: "white", border: "none",
        background: "linear-gradient(140deg, #0E3B2E 0%, #1B5E47 100%)",
      }}
    >
      <div style={{
        position: "absolute", width: 180, height: 180, borderRadius: "50%",
        background: "rgba(227,52,63,0.18)", top: -70, right: -60, pointerEvents: "none",
      }} />
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.8, marginBottom: 10 }}>
        France Inter · Bestioles
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, position: "relative" }}>
        <span style={{ fontSize: 34 }}>🐾</span>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Rallye Bestioles</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>Choisis une bestiole, écoute, réponds !</div>
        </div>
      </div>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6, background: "#E3343F", color: "white",
        padding: "8px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700,
        fontFamily: "'Plus Jakarta Sans', sans-serif", position: "relative",
      }}>
        Jouer & voir le classement →
      </div>
    </Link>
  );
}
