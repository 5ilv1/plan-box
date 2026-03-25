"use client";

import { useEffect, useState, useRef } from "react";
import QRCode from "qrcode";

interface EleveRB {
  id: number;
  prenom: string;
  nom: string;
  identifiant: string;
  auth_id: string | null;
}

interface CarteQR {
  eleve: EleveRB;
  token: string | null;
  qrDataUrl: string | null;
  erreur?: string;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function PageQRCodes() {
  const [cartes, setCartes] = useState<CarteQR[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreurGlobale, setErreurGlobale] = useState("");

  useEffect(() => {
    charger();
  }, []);

  async function charger() {
    setChargement(true);
    setErreurGlobale("");

    // 1. Récupérer tous les élèves Repetibox ayant un auth_id
    const res = await fetch("/api/repetibox-eleves");
    if (!res.ok) {
      setErreurGlobale("Impossible de charger les élèves.");
      setChargement(false);
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
          const qrDataUrl = await QRCode.toDataURL(url, { width: 200, margin: 2 });

          return { eleve, token: genJson.token, qrDataUrl };
        } catch {
          return { eleve, token: null, qrDataUrl: null, erreur: "Erreur réseau" };
        }
      })
    );

    setCartes(cartesFinales);
    setChargement(false);
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
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg)" }}>
      {/* Header — masqué à l'impression */}
      <div className="no-print" style={{ padding: "24px 32px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}><span className="ms" style={{ fontSize: 22, verticalAlign: "middle" }}>print</span> QR codes élèves Repetibox</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            {cartes.length} élève{cartes.length > 1 ? "s" : ""} — valables 1 an, regénérables à la demande
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={charger} className="btn-ghost"><span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>refresh</span> Regénérer</button>
          <button onClick={() => window.print()} className="btn-primary"><span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>print</span> Imprimer</button>
        </div>
      </div>

      {/* Grille de cartes */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 24,
          padding: 32,
        }}
        className="qr-grid"
      >
        {cartes.map(({ eleve, qrDataUrl, erreur }) => (
          <div
            key={eleve.id}
            style={{
              border: "2px solid var(--border)",
              borderRadius: 12,
              padding: 20,
              backgroundColor: "white",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              breakInside: "avoid",
              pageBreakInside: "avoid",
            }}
          >
            {/* En-tête carte */}
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                Plan Box
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>
                {eleve.prenom} {eleve.nom}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                ID : {eleve.identifiant}
              </div>
            </div>

            {/* QR Code */}
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt={`QR code de ${eleve.prenom} ${eleve.nom}`}
                style={{ width: 180, height: 180 }}
              />
            ) : (
              <div
                style={{
                  width: 180,
                  height: 180,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#FEE2E2",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "#DC2626",
                  textAlign: "center",
                  padding: 12,
                }}
              >
                {erreur ?? "Erreur"}
              </div>
            )}

            {/* Instructions */}
            <p style={{ fontSize: 11, color: "var(--text-secondary)", textAlign: "center", lineHeight: 1.4, margin: 0 }}>
              Scanne ce code avec ton iPad pour te connecter automatiquement
            </p>
          </div>
        ))}
      </div>

      {/* Styles impression */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .qr-grid {
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 16px !important;
            padding: 16px !important;
          }
        }
      `}</style>
    </div>
  );
}
