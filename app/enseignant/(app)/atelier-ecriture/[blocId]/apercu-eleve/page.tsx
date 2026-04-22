"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import AtelierEcriture from "@/components/AtelierEcriture";

interface Contenu {
  sujet: string;
  contrainte: string;
  afficher_contrainte: boolean;
  texte_courant: string;
  historique: { date: string; texte: string }[];
  annotations: {
    id: string;
    date: string;
    debut: number;
    fin: number;
    extrait: string;
    suggestion: string;
    commentaire?: string;
    statut: "nouvelle" | "lue" | "acceptee" | "ignoree";
  }[];
  texte_final: string;
  date_envoi: string | null;
}

interface EleveInfo {
  prenom: string;
  nom: string;
  classe: string;
}

export default function ApercuElevePage({
  params,
}: {
  params: Promise<{ blocId: string }>;
}) {
  const { blocId } = use(params);
  const [loading, setLoading] = useState(true);
  const [contenu, setContenu] = useState<Contenu | null>(null);
  const [eleve, setEleve] = useState<EleveInfo | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/enseignant/ecriture/bloc?blocId=${blocId}`);
        if (res.ok) {
          const data = await res.json();
          setContenu(data.contenu);
          setEleve(data.eleve);
        }
      } catch {}
      setLoading(false);
    })();
  }, [blocId]);

  if (loading) {
    return <div className="skeleton" style={{ height: 240, borderRadius: 16 }} />;
  }

  if (!contenu) {
    return (
      <div style={{ padding: "3rem", textAlign: "center", color: "var(--pb-on-surface-variant)" }}>
        <p>Bloc introuvable.</p>
        <Link href={`/enseignant/atelier-ecriture/${blocId}`} className="btn-primary-sm" style={{ marginTop: 16 }}>
          ← Retour
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Bandeau aperçu */}
      <div style={{ marginBottom: 16 }}>
        <Link
          href={`/enseignant/atelier-ecriture/${blocId}`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 13, color: "var(--pb-on-surface-variant)",
            textDecoration: "none", marginBottom: 10,
          }}
        >
          <span className="ms" style={{ fontSize: 18 }}>arrow_back</span>
          Retour à la correction
        </Link>
        <div style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          background: "rgba(234,179,8,0.12)",
          border: "1.5px solid rgba(234,179,8,0.45)",
          borderRadius: 12, padding: "10px 14px",
        }}>
          <span className="ms" style={{ fontSize: 20, color: "#B45309" }}>visibility</span>
          <div style={{ fontSize: 13, color: "#92400E" }}>
            <strong>Aperçu élève</strong>
            {eleve && <> — ce que voit {eleve.prenom} {eleve.nom} ({eleve.classe})</>}
            {" · "}
            <span style={{ fontStyle: "italic" }}>
              lecture seule, aucune action n&apos;est réellement envoyée
            </span>
          </div>
        </div>
      </div>

      {/* Sujet / contrainte (comme côté élève) */}
      {contenu.sujet && (
        <div style={{
          background: "linear-gradient(135deg, rgba(124,58,237,0.06), rgba(124,58,237,0.12))",
          border: "1.5px solid rgba(124,58,237,0.2)",
          borderRadius: 16, padding: "16px 20px", marginBottom: 16,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#7C3AED", marginBottom: 6 }}>
            Sujet
          </div>
          <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 15, margin: 0 }}>
            {contenu.sujet}
          </p>
        </div>
      )}

      <AtelierEcriture
        blocId={blocId}
        sujet={contenu.sujet}
        contrainte={contenu.contrainte}
        afficherContrainte={contenu.afficher_contrainte ?? true}
        contenu={contenu as unknown as Record<string, unknown>}
        onTermine={() => {}}
        apercu
      />
    </>
  );
}
