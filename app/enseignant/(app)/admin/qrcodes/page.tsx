"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import Avatar from "@/components/Avatar";
import type { BigHeadsOptions } from "@/lib/bigheads";

interface EleveRB {
  id: number;
  prenom: string;
  nom: string;
  identifiant: string;
  mot_de_passe: string | null;
  auth_id: string | null;
  avatar_bigheads: BigHeadsOptions | null;
}

interface CarteQR {
  eleve: EleveRB;
  token: string | null;
  qrDataUrl: string | null;
  erreur?: string;
}

const SITE_URL = typeof window !== "undefined"
  ? window.location.origin
  : (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");

/** Illustration décorative de la bande droite. */
const ILLUSTRATION = "/carte-eleve-illustration.png";

export default function PageQRCodes() {
  const [cartes, setCartes] = useState<CarteQR[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreurGlobale, setErreurGlobale] = useState("");
  const [illustrationOk, setIllustrationOk] = useState(true);

  useEffect(() => {
    charger();
  }, []);

  async function charger() {
    // Le sablier disparaît quoi qu'il arrive : sans ce `finally`, une
    // requête qui échoue laisse la page sur « Chargement… » indéfiniment.
    try {
      setChargement(true);
      setErreurGlobale("");

      // 1. Récupérer tous les élèves Repetibox ayant un auth_id
      //    (avecIdentifiants=1 → identifiant + mot de passe en clair pour la carte)
      const res = await fetch("/api/repetibox-eleves?avecIdentifiants=1");
      if (!res.ok) {
        setErreurGlobale("Impossible de charger les élèves.");
        return;
      }

      const json = await res.json();
      const eleves: EleveRB[] = (json.eleves ?? []).filter((e: EleveRB) => e.auth_id);

      // 2. Pour chaque élève, générer ou récupérer un token QR
      const cartesInit: CarteQR[] = eleves.map((e) => ({ eleve: e, token: null, qrDataUrl: null }));
      setCartes(cartesInit);

      const cartesFinales = await Promise.all(
        eleves.map(async (eleve): Promise<CarteQR> => {
          try {
            const genRes = await fetch("/api/qr-login/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ eleveAuthId: eleve.auth_id }),
            });
            const genJson = await genRes.json();

            if (!genRes.ok || !genJson.token) {
              return { eleve, token: null, qrDataUrl: null, erreur: genJson.erreur ?? "Erreur token" };
            }

            const url = `${SITE_URL}/eleve/qr/${genJson.token}`;
            const qrDataUrl = await QRCode.toDataURL(url, { width: 320, margin: 1 });

            return { eleve, token: genJson.token, qrDataUrl };
          } catch {
            return { eleve, token: null, qrDataUrl: null, erreur: "Erreur réseau" };
          }
        })
      );

      setCartes(cartesFinales);
    } finally {
      setChargement(false);
    }
  }

  if (chargement) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid var(--primary-mid)", borderTopColor: "var(--primary)", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: "var(--text-secondary)" }}>Génération des QR codes…</p>
        </div>
      </div>
    );
  }

  if (erreurGlobale) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ color: "var(--error)" }}>{erreurGlobale}</p>
      </div>
    );
  }

  return (
    <div className="cartes-racine" style={{ minHeight: "100vh", backgroundColor: "var(--bg)" }}>
      {/* Header — masqué à l'impression */}
      <div className="no-print" style={{ padding: "24px 32px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}><span className="ms" style={{ fontSize: 22, verticalAlign: "middle" }}>badge</span> Cartes de connexion élèves</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            {cartes.length} élève{cartes.length > 1 ? "s" : ""} — QR code + identifiant et mot de passe, valables 1 an
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={charger} className="btn-ghost"><span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>refresh</span> Regénérer</button>
          <button onClick={() => window.print()} className="btn-primary"><span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>print</span> Imprimer</button>
        </div>
      </div>

      {/* Grille de cartes */}
      <div className="qr-grid">
        {cartes.map(({ eleve, qrDataUrl, erreur }) => (
          <article key={eleve.id} className="carte-eleve">
            {/* Colonne infos */}
            <div className="carte-infos">
              {/* En-tête : avatar + nom */}
              <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar
                  options={eleve.avatar_bigheads}
                  seed={eleve.prenom}
                  size={58}
                  style={{ border: "2px solid var(--primary-mid)" }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Plan Box
                  </div>
                  <div style={{ fontSize: 19, fontWeight: 800, color: "var(--text)", lineHeight: 1.15, overflowWrap: "anywhere" }}>
                    {eleve.prenom}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", lineHeight: 1.2 }}>
                    {eleve.nom}
                  </div>
                </div>
              </header>

              {/* Identifiants + QR */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginTop: 14 }}>
                <div style={{ flex: 1, minWidth: 0, maxWidth: 260, display: "flex", flexDirection: "column", gap: 6 }}>
                  <Champ label="Identifiant" valeur={eleve.identifiant} />
                  <Champ label="Mot de passe" valeur={eleve.mot_de_passe ?? "—"} />
                </div>

                <div style={{ textAlign: "center", flexShrink: 0 }}>
                  {qrDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="qr-img"
                      src={qrDataUrl}
                      alt={`QR code de ${eleve.prenom} ${eleve.nom}`}
                      style={{ width: 100, height: 100, display: "block", borderRadius: 6 }}
                    />
                  ) : (
                    <div className="qr-img" style={{ width: 100, height: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "#FEE2E2", borderRadius: 6, fontSize: 10, color: "#DC2626", textAlign: "center", padding: 8 }}>
                      {erreur ?? "Erreur"}
                    </div>
                  )}
                  <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 4 }}>
                    Scanne-moi
                  </div>
                </div>
              </div>
            </div>

            {/* Bande illustration à droite */}
            {illustrationOk && (
              <div className="carte-illustration">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ILLUSTRATION}
                  alt=""
                  onError={() => setIllustrationOk(false)}
                  style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "center", display: "block" }}
                />
              </div>
            )}
          </article>
        ))}
      </div>

      <style>{`
        .qr-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
          gap: 20px;
          padding: 32px;
        }
        .carte-eleve {
          display: flex;
          min-height: 190px;
          align-items: stretch;
          overflow: hidden;
          background: white;
          border: 2px solid var(--border);
          border-radius: 14px;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .carte-infos {
          flex: 1;
          min-width: 0;
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .carte-illustration {
          width: 118px;
          flex-shrink: 0;
          background: #E7C3B2;
          border-left: 2px solid var(--border);
        }

        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }

          /* Le layout enseignant impose une barre latérale fixe de 288 px et un
             en-tête. Sans ça ils s'impriment et amputent d'autant la largeur
             utile, ce qui écrase la colonne des identifiants. */
          .ens-sidebar,
          .ens-sidebar-overlay,
          .ens-header { display: none !important; }
          .ens-main-area { margin-left: 0 !important; }
          .ens-content { padding: 0 !important; }

          /* html/body sont en height:100% et le layout en min-height:100vh :
             à l'impression cela borne le document à UNE page et tronque la
             dernière carte. On libère la hauteur sur toute la chaîne. */
          html, body,
          .ens-layout,
          .ens-main-area,
          .ens-content,
          .cartes-racine {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
          }
          .ens-layout, .ens-main-area { display: block !important; }

          /* Chrome n'applique pas break-inside:avoid aux items d'une grille :
             en impression on repasse en blocs inline, où la règle est
             respectée — sinon la dernière carte de chaque page est coupée. */
          .qr-grid {
            display: block !important;
            padding: 8px !important;
            font-size: 0;
          }
          .carte-eleve {
            display: inline-flex !important;
            width: calc(50% - 5px);
            vertical-align: top;
            margin: 0 0 8px 0;
            min-height: 168px;
            border-color: #9CA3AF !important;
            border-radius: 10px;
          }
          .carte-eleve:nth-child(odd) { margin-right: 10px; }
          .carte-infos { padding: 14px !important; }
          .carte-illustration { width: 100px; }
          .qr-img { width: 92px !important; height: 92px !important; }
        }
      `}</style>
    </div>
  );
}

/** Ligne « étiquette + valeur » des identifiants de connexion. */
function Champ({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div
      className="champ"
      style={{
        border: "1.5px solid var(--border)",
        borderRadius: 8,
        padding: "5px 9px",
        background: "var(--primary-pale)",
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: "var(--text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: tailleValeur(valeur),
          fontWeight: 800,
          color: "var(--text)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          letterSpacing: "0.02em",
          lineHeight: 1.3,
          whiteSpace: "nowrap",
        }}
      >
        {valeur}
      </div>
    </div>
  );
}

/**
 * Taille de police de la valeur, choisie pour que l'identifiant tienne sur UNE
 * ligne y compris dans la colonne étroite de l'impression (2 cartes par ligne).
 */
function tailleValeur(valeur: string): number {
  const n = valeur.length;
  if (n <= 9) return 15;
  if (n <= 11) return 13.5;
  if (n <= 13) return 12;
  if (n <= 16) return 10;
  if (n <= 20) return 8.5;
  return 7;
}
