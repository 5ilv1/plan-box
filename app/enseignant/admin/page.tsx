"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import EnseignantLayout from "@/components/EnseignantLayout";

const SECTIONS = [
  { href: "/enseignant/admin/chapitres", icone: "library_books", titre: "Chapitres", desc: "Créer, ordonner et configurer les chapitres par matière et niveau" },
  { href: "/enseignant/admin/eleves", icone: "person", titre: "Élèves", desc: "Gérer les élèves Plan Box et Repetibox, niveaux, groupes, chapitres" },
  { href: "/enseignant/admin/groupes", icone: "group", titre: "Groupes", desc: "Créer des groupes et y assigner des élèves des deux applications" },
  { href: "/enseignant/admin/exercices", icone: "folder_open", titre: "Exercices", desc: "Parcourir et gérer la banque d'exercices générés par l'IA" },
  { href: "/enseignant/admin/planning", icone: "calendar_today", titre: "Planning", desc: "Vue calendrier hebdomadaire du plan de travail de tous les élèves" },
  { href: "/enseignant/admin/qrcodes", icone: "smartphone", titre: "QR codes iPad", desc: "Générer et imprimer les QR codes de connexion rapide pour les élèves Repetibox" },
];

export default function PageAdmin() {
  const router = useRouter();
  const supabase = createClient();
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push("/enseignant");
      else setChargement(false);
    });
  }, []);

  if (chargement) {
    return (
      <EnseignantLayout>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", border: "3px solid var(--primary-mid)", borderTopColor: "var(--primary)", animation: "spin 0.8s linear infinite" }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </EnseignantLayout>
    );
  }

  return (
    <EnseignantLayout>
      <div className="page">
        <div className="container" style={{ maxWidth: 680 }}>

          <p className="text-secondary text-sm" style={{ marginBottom: 28 }}>
            Gérez la configuration complète de votre classe Plan Box.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {SECTIONS.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                style={{ textDecoration: "none" }}
              >
                <div
                  className="card"
                  style={{
                    padding: "20px 22px",
                    cursor: "pointer",
                    transition: "box-shadow 0.15s, transform 0.1s",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    height: "100%",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 20px rgba(0,0,0,0.1)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = "";
                    (e.currentTarget as HTMLElement).style.boxShadow = "";
                  }}
                >
                  <div><span className="ms" style={{ fontSize: 32, color: "var(--primary)" }}>{s.icone}</span></div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", marginBottom: 4 }}>
                      {s.titre}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      {s.desc}
                    </div>
                  </div>
                  <div style={{ marginTop: "auto", fontSize: 13, color: "var(--primary)", fontWeight: 600 }}>
                    Accéder →
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </EnseignantLayout>
  );
}
