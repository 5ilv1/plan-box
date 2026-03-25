"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import EnseignantLayout from "@/components/EnseignantLayout";
import {
  Matiere,
  fetchMatieres,
  couleurBg as _couleurBg,
  couleurTexte as _couleurTexte,
  iconeMatiere as _iconeMatiere,
} from "@/lib/matieres";

interface Lecon {
  id: string;
  titre: string;
  matiere: string;
  url: string;
  annee: 1 | 2 | null;
  created_at: string;
}

interface Groupe {
  id: string;
  nom: string;
}

type EtatLot = "attente" | "upload" | "sauvegarde" | "done" | "erreur";

interface LotItem {
  file: File;
  titre: string;
  matiere: string;
  annee: 1 | 2 | null;
  etat: EtatLot;
}

export default function BanqueLecons() {
  const router = useRouter();
  const supabase = createClient();

  /* ── Données ── */
  const [lecons, setLecons] = useState<Lecon[]>([]);
  const [matieres, setMatieres] = useState<Matiere[]>([]);
  const [chargement, setChargement] = useState(true);

  /* ── Helpers couleurs/icones (dynamiques) ── */
  const MATIERES = matieres.map((m) => m.nom);
  const couleurBgM  = (nom: string) => _couleurBg(matieres, nom);
  const couleurTexteM = (nom: string) => _couleurTexte(matieres, nom);
  const iconeM      = (nom: string) => _iconeMatiere(matieres, nom);

  /* ── Filtres ── */
  const [filtreMatiere, setFiltreMatiere] = useState<string>("toutes");
  const [filtreAnnee, setFiltreAnnee] = useState<0 | 1 | 2>(0); // 0 = toutes
  const [recherche, setRecherche] = useState("");

  /* ── Modal ajout / édition ── */
  const [modalForm, setModalForm] = useState<{
    id?: string; titre: string; matiere: string; url: string; nomFichier: string; annee: 1 | 2 | null;
  } | null>(null);
  const [upload, setUpload] = useState(false);
  const [enSauvegarde, setEnSauvegarde] = useState(false);
  const [erreurForm, setErreurForm] = useState("");

  /* ── Modal affectation ── */
  const [modalAffect, setModalAffect] = useState<Lecon | null>(null);
  const [groupes, setGroupes] = useState<Groupe[]>([]);
  const [groupesCoches, setGroupesCoches] = useState<Set<string>>(new Set());
  const [dateAffect, setDateAffect] = useState(new Date().toISOString().split("T")[0]);
  const [enAffect, setEnAffect] = useState(false);
  const [messageAffect, setMessageAffect] = useState("");

  /* ── Suppression ── */
  const [enSuppression, setEnSuppression] = useState<string | null>(null);

  /* ── Affectations : url → date ── */
  const [affectationsParUrl, setAffectationsParUrl] = useState<Record<string, string>>({});

  /* ── Copie lien ── */
  const [copie, setCopie] = useState<string | null>(null); // id de la leçon dont le lien vient d'être copié

  /* ── Import en lot ── */
  const [modalLot, setModalLot] = useState(false);
  const [lotFichiers, setLotFichiers] = useState<LotItem[]>([]);
  const [lotEnCours, setLotEnCours] = useState(false);
  const [lotDefautMatiere, setLotDefautMatiere] = useState("français");
  const [lotDefautAnnee, setLotDefautAnnee] = useState<1 | 2 | null>(null);

  /* ── Auth + chargement initial ── */
  const charger = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/enseignant"); return; }

    const [resLecons, resMatieres] = await Promise.all([
      fetch("/api/banque-lecons"),
      fetchMatieres(),
    ]);
    const json = resLecons.ok ? await resLecons.json() : { lecons: [], affectationsParUrl: {} };
    setLecons(json.lecons ?? []);
    setAffectationsParUrl(json.affectationsParUrl ?? {});
    setMatieres(resMatieres);
    if (resMatieres.length > 0) setLotDefautMatiere(resMatieres[0].nom);
    setChargement(false);
  }, [router, supabase]);

  useEffect(() => { charger(); }, [charger]);

  /* ── Leçons filtrées ── */
  const leconsFiltrees = lecons.filter((l) => {
    const matOk  = filtreMatiere === "toutes" || l.matiere === filtreMatiere;
    const anneeOk = filtreAnnee === 0 || l.annee === filtreAnnee;
    const rechOk = recherche.trim() === "" || l.titre.toLowerCase().includes(recherche.toLowerCase());
    return matOk && anneeOk && rechOk;
  });

  /* ── Upload PDF ── */
  async function uploadFichier(file: File) {
    if (!modalForm) return;
    setUpload(true);
    setErreurForm("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload-lecon", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) { setErreurForm(`❌ Upload échoué : ${json.error}`); return; }
      setModalForm((prev) => prev ? { ...prev, url: json.url, nomFichier: json.nom ?? file.name } : prev);
    } finally {
      setUpload(false);
    }
  }

  /* ── Sauvegarder (ajout ou modif) ── */
  async function sauvegarder() {
    if (!modalForm) return;
    if (!modalForm.titre.trim()) { setErreurForm(" Le titre est requis."); return; }
    if (!modalForm.matiere)      { setErreurForm(" Choisis une matière."); return; }
    if (!modalForm.url.trim())   { setErreurForm(" Un fichier ou un lien est requis."); return; }

    setEnSauvegarde(true);
    setErreurForm("");
    try {
      const method = modalForm.id ? "PATCH" : "POST";
      const body = modalForm.id
        ? { id: modalForm.id, titre: modalForm.titre, matiere: modalForm.matiere, url: modalForm.url, annee: modalForm.annee }
        : { titre: modalForm.titre, matiere: modalForm.matiere, url: modalForm.url, annee: modalForm.annee };

      const res = await fetch("/api/banque-lecons", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setErreurForm(`❌ ${json.erreur}`); return; }

      if (modalForm.id) {
        setLecons((prev) => prev.map((l) => l.id === modalForm.id ? { ...l, ...json.lecon } : l));
      } else {
        setLecons((prev) => [...prev, json.lecon].sort((a, b) =>
          a.matiere.localeCompare(b.matiere) || a.titre.localeCompare(b.titre)
        ));
      }
      setModalForm(null);
    } finally {
      setEnSauvegarde(false);
    }
  }

  /* ── Supprimer une leçon de la banque (+ plan_travail côté élèves) ── */
  async function supprimerLecon(id: string) {
    setEnSuppression(id);
    try {
      const lecon = lecons.find((l) => l.id === id);
      await fetch("/api/banque-lecons", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setLecons((prev) => prev.filter((l) => l.id !== id));
      if (lecon?.url) {
        setAffectationsParUrl((prev) => { const next = { ...prev }; delete next[lecon.url]; return next; });
      }
    } finally {
      setEnSuppression(null);
    }
  }

  /* ── Ouvrir modal affectation ── */
  async function ouvrirAffectation(lecon: Lecon) {
    setModalAffect(lecon);
    setGroupesCoches(new Set());
    setMessageAffect("");
    setDateAffect(new Date().toISOString().split("T")[0]);
    if (groupes.length === 0) {
      const res = await fetch("/api/admin/groupes");
      const json = res.ok ? await res.json() : { groupes: [] };
      setGroupes((json.groupes ?? []).map((g: { id: string; nom: string }) => ({ id: g.id, nom: g.nom })));
    }
  }

  /* ── Affecter aux groupes ── */
  async function affecter() {
    if (!modalAffect) return;
    if (groupesCoches.size === 0) { setMessageAffect(" Sélectionne au moins un groupe."); return; }

    const groupesSel = groupes
      .filter((g) => groupesCoches.has(g.id))
      .map((g) => ({ groupeId: g.id, groupeNom: g.nom }));

    setEnAffect(true);
    setMessageAffect("");
    try {
      const res = await fetch("/api/affecter-lecon-copier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titre: modalAffect.titre,
          url: modalAffect.url,
          dateAssignation: dateAffect,
          groupes: groupesSel,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessageAffect(`❌ ${json.erreur}`);
      } else if (json.nb === 0) {
        setMessageAffect("Aucun bloc créé. Vérifie que les groupes ont des élèves.");
      } else {
        setMessageAffect(`Leçon affectée à ${json.nb} élève(s) !`);
        setAffectationsParUrl((prev) => ({ ...prev, [modalAffect.url]: dateAffect }));
        setTimeout(() => setModalAffect(null), 1800);
      }
    } catch {
      setMessageAffect(" Erreur réseau.");
    } finally {
      setEnAffect(false);
    }
  }

  /* ── Import en lot ── */
  function ajouterFichiersLot(files: File[]) {
    setLotFichiers((prev) => [
      ...prev,
      ...files.map((f) => ({
        file: f,
        titre: f.name.replace(/\.pdf$/i, ""),
        matiere: lotDefautMatiere,
        annee: lotDefautAnnee,
        etat: "attente" as EtatLot,
      })),
    ]);
  }

  function appliquerDefautATous() {
    setLotFichiers((prev) => prev.map((it) =>
      it.etat === "done" ? it : { ...it, matiere: lotDefautMatiere, annee: lotDefautAnnee }
    ));
  }

  async function importerLot() {
    setLotEnCours(true);
    const aTraiter = lotFichiers
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => it.etat === "attente" || it.etat === "erreur");

    for (const { i } of aTraiter) {
      const item = lotFichiers[i];

      // Upload fichier
      setLotFichiers((prev) => prev.map((it, idx) => idx === i ? { ...it, etat: "upload" } : it));
      const fd = new FormData();
      fd.append("file", item.file);
      const uploadRes = await fetch("/api/upload-lecon", { method: "POST", body: fd });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) {
        setLotFichiers((prev) => prev.map((it, idx) => idx === i ? { ...it, etat: "erreur" } : it));
        continue;
      }

      // Sauvegarder en BDD
      setLotFichiers((prev) => prev.map((it, idx) => idx === i ? { ...it, etat: "sauvegarde" } : it));
      const saveRes = await fetch("/api/banque-lecons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titre: item.titre, matiere: item.matiere, url: uploadJson.url, annee: item.annee }),
      });
      const saveJson = await saveRes.json();
      if (!saveRes.ok) {
        setLotFichiers((prev) => prev.map((it, idx) => idx === i ? { ...it, etat: "erreur" } : it));
        continue;
      }

      setLotFichiers((prev) => prev.map((it, idx) => idx === i ? { ...it, etat: "done" } : it));
      setLecons((prev) => [...prev, saveJson.lecon].sort((a, b) =>
        a.matiere.localeCompare(b.matiere) || a.titre.localeCompare(b.titre)
      ));
    }
    setLotEnCours(false);
  }

  /* ── Rendu chargement ── */
  if (chargement) {
    return (
      <EnseignantLayout>
        <main style={{ padding: "32px 24px", maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="skeleton" style={{ width: 260, height: 130, borderRadius: 12 }} />
            ))}
          </div>
        </main>
      </EnseignantLayout>
    );
  }

  const coulFiltreActif = filtreMatiere !== "toutes" ? couleurBgM(filtreMatiere) : undefined;
  const texteActif = filtreMatiere !== "toutes" ? couleurTexteM(filtreMatiere) : undefined;

  return (
    <EnseignantLayout>
      <main style={{ padding: "32px 24px", maxWidth: 1100, margin: "0 auto" }}>

        {/* ── En-tête ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}><span className="ms" style={{ fontSize: 22, verticalAlign: "middle" }}>library_books</span> Banque de leçons</h1>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>
              {lecons.length} leçon{lecons.length !== 1 ? "s" : ""} enregistrée{lecons.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn-ghost"
              onClick={() => { setLotFichiers([]); setModalLot(true); }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", fontSize: 14, border: "1.5px solid var(--border)" }}
            >
              <span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>download</span> Import en lot
            </button>
            <button
              className="btn-primary"
              onClick={() => setModalForm({ titre: "", matiere: "français", url: "", nomFichier: "", annee: null })}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", fontSize: 14 }}
            >
              + Ajouter une leçon
            </button>
          </div>
        </div>

        {/* ── Barre de recherche ── */}
        <input
          type="text"
          placeholder="Rechercher par titre…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          className="form-input"
          style={{ width: "100%", maxWidth: 360, marginBottom: 16, fontSize: 14 }}
        />

        {/* ── Filtre année ── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>Année :</span>
          {([0, 1, 2] as const).map((a) => {
            const actif = filtreAnnee === a;
            const label = a === 0 ? "Toutes" : `Année ${a}`;
            const bg    = a === 1 ? "#ECFDF5" : a === 2 ? "#EFF6FF" : undefined;
            const color = a === 1 ? "#15803D" : a === 2 ? "#1D4ED8" : undefined;
            return (
              <button
                key={a}
                onClick={() => setFiltreAnnee(a)}
                style={{
                  padding: "4px 14px", borderRadius: 999, fontSize: 13, fontWeight: actif ? 700 : 500,
                  border: `1.5px solid ${actif ? (color ?? "var(--primary)") : "var(--border)"}`,
                  background: actif ? (bg ?? "var(--primary-pale)") : "white",
                  color: actif ? (color ?? "var(--primary)") : "var(--text-secondary)",
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* ── Filtres matière ── */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
          {["toutes", ...MATIERES].map((m) => {
            const actif = filtreMatiere === m;
            const bg = actif && m !== "toutes" ? couleurBgM(m) : actif ? "var(--primary-pale)" : "white";
            const color = actif && m !== "toutes" ? couleurTexteM(m) : actif ? "var(--primary)" : "var(--text-secondary)";
            return (
              <button
                key={m}
                onClick={() => setFiltreMatiere(m)}
                style={{
                  padding: "5px 14px", borderRadius: 999, fontSize: 13, fontWeight: actif ? 700 : 500,
                  border: `1.5px solid ${actif ? (m !== "toutes" ? couleurTexteM(m) ?? "var(--primary)" : "var(--primary)") : "var(--border)"}`,
                  background: bg, color, cursor: "pointer", transition: "all 0.15s",
                }}
              >
                {m === "toutes" ? "Toutes" : `${iconeM(m)} ${m.charAt(0).toUpperCase() + m.slice(1)}`}
              </button>
            );
          })}
        </div>

        {/* ── Grille de cartes ── */}
        {leconsFiltrees.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-secondary)", fontSize: 14 }}>
            {lecons.length === 0
              ? "Aucune leçon dans la banque. Commence par en ajouter une !"
              : "Aucune leçon ne correspond à ta recherche."}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
            {leconsFiltrees.map((lecon) => {
              const bg = couleurBgM(lecon.matiere) ?? "#F3F4F6";
              const tc = couleurTexteM(lecon.matiere) ?? "#6B7280";
              const icone = iconeM(lecon.matiere);
              const enSuppr = enSuppression === lecon.id;
              return (
                <div
                  key={lecon.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    background: "white",
                    overflow: "hidden",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                    opacity: enSuppr ? 0.5 : 1,
                    transition: "opacity 0.15s, box-shadow 0.15s",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {/* Badge matière + année */}
                  <div style={{ padding: "10px 14px", background: bg + "88", borderBottom: `2px solid ${bg}`, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 15 }}>{icone}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: tc, textTransform: "uppercase", letterSpacing: "0.05em", flex: 1 }}>
                      {lecon.matiere}
                    </span>
                    {lecon.annee && (
                      <span style={{
                        fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 999,
                        background: lecon.annee === 1 ? "#D1FAE5" : "#DBEAFE",
                        color: lecon.annee === 1 ? "#15803D" : "#1D4ED8",
                        letterSpacing: "0.04em",
                      }}>
                        A{lecon.annee}
                      </span>
                    )}
                  </div>

                  {/* Titre */}
                  <div style={{ padding: "12px 14px", flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", lineHeight: 1.4, marginBottom: 6 }}>
                      {lecon.titre}
                    </div>
                    <a
                      href={lecon.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12, color: "var(--primary)", textDecoration: "underline" }}
                    >
                      Voir le document →
                    </a>
                  </div>

                  {/* Actions */}
                  <div style={{ padding: "8px 14px 12px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {affectationsParUrl[lecon.url] ? (
                      <div style={{
                        flex: 1, padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                        background: "#D1FAE5", color: "#15803D", border: "1.5px solid #6EE7B7",
                        display: "flex", alignItems: "center", gap: 5,
                      }}>
                        <span><span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>check_circle</span> Affectée le {new Date(affectationsParUrl[lecon.url] + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                        <button
                          onClick={() => ouvrirAffectation(lecon)}
                          disabled={enSuppr}
                          title="Modifier l'affectation"
                          style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#15803D", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0, whiteSpace: "nowrap" }}
                        >
                          modifier
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => ouvrirAffectation(lecon)}
                        disabled={enSuppr}
                        style={{
                          flex: 1, padding: "6px 10px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                          background: "var(--primary)", color: "white", border: "none", cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>menu_book</span> Affecter
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(lecon.url);
                        setCopie(lecon.id);
                        setTimeout(() => setCopie(null), 2000);
                      }}
                      disabled={enSuppr}
                      title="Copier le lien"
                      style={{
                        width: 32, height: 32, borderRadius: 8, fontSize: 14,
                        background: copie === lecon.id ? "#D1FAE5" : "var(--bg)",
                        border: "1px solid var(--border)", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "background 0.2s", flexShrink: 0,
                      }}
                    >
                      <span className="ms" style={{ fontSize: 16 }}>{copie === lecon.id ? "check_circle" : "link"}</span>
                    </button>
                    <button
                      onClick={() => setModalForm({ id: lecon.id, titre: lecon.titre, matiere: lecon.matiere, url: lecon.url, nomFichier: "", annee: lecon.annee })}
                      disabled={enSuppr}
                      className="btn-ghost"
                      style={{ padding: "6px 10px", fontSize: 13, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <span className="ms" style={{ fontSize: 16 }}>edit</span>
                    </button>
                    <button
                      onClick={() => supprimerLecon(lecon.id)}
                      disabled={enSuppr}
                      style={{
                        width: 32, height: 32, borderRadius: "50%",
                        background: "#FEE2E2", border: "none",
                        color: "#DC2626", fontSize: 15, lineHeight: 1,
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 700, transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#DC2626"; e.currentTarget.style.color = "white"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "#FEE2E2"; e.currentTarget.style.color = "#DC2626"; }}
                      title="Supprimer de la banque"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ════ MODAL AJOUT / ÉDITION ════ */}
      {modalForm && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget) setModalForm(null); }}
        >
          <div style={{ background: "white", borderRadius: 16, padding: 28, width: "100%", maxWidth: 480, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 20px" }}>
              {modalForm.id ? <><span className="ms" style={{ fontSize: 18, verticalAlign: "middle" }}>edit</span> Modifier la leçon</> : "Ajouter une leçon"}
            </h2>

            {/* Titre */}
            <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 }}>Titre de la leçon</label>
            <input
              type="text"
              className="form-input"
              value={modalForm.titre}
              onChange={(e) => setModalForm((p) => p ? { ...p, titre: e.target.value } : p)}
              placeholder="Ex : La phrase complexe"
              style={{ width: "100%", marginBottom: 16 }}
            />

            {/* Matière */}
            <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 8 }}>Matière</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              {MATIERES.map((m) => {
                const sel = modalForm.matiere === m;
                return (
                  <button
                    key={m}
                    onClick={() => setModalForm((p) => p ? { ...p, matiere: m } : p)}
                    style={{
                      padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: sel ? 700 : 500,
                      border: `1.5px solid ${sel ? (couleurTexteM(m) ?? "var(--primary)") : "var(--border)"}`,
                      background: sel ? (couleurBgM(m) ?? "var(--primary-pale)") : "white",
                      color: sel ? (couleurTexteM(m) ?? "var(--primary)") : "var(--text-secondary)",
                      cursor: "pointer",
                    }}
                  >
                    {iconeM(m)} {m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                );
              })}
            </div>

            {/* Année */}
            <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 8 }}>Année (optionnel)</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {([null, 1, 2] as const).map((a) => {
                const sel = modalForm.annee === a;
                const label = a === null ? "Non définie" : `Année ${a}`;
                const color = a === 1 ? "#15803D" : a === 2 ? "#1D4ED8" : undefined;
                const bg    = a === 1 ? "#D1FAE5" : a === 2 ? "#DBEAFE" : undefined;
                return (
                  <button
                    key={String(a)}
                    onClick={() => setModalForm((p) => p ? { ...p, annee: a } : p)}
                    style={{
                      padding: "5px 14px", borderRadius: 999, fontSize: 13, fontWeight: sel ? 700 : 500,
                      border: `1.5px solid ${sel ? (color ?? "var(--border)") : "var(--border)"}`,
                      background: sel ? (bg ?? "var(--primary-pale)") : "white",
                      color: sel ? (color ?? "var(--text)") : "var(--text-secondary)",
                      cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Fichier PDF */}
            <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 }}>Fichier PDF</label>
            <label style={{
              display: "flex", alignItems: "center", gap: 8, padding: "12px 16px",
              border: `2px dashed ${modalForm.url ? "var(--primary)" : "var(--border)"}`,
              borderRadius: 10, cursor: "pointer", marginBottom: 20,
              fontSize: 13, color: "var(--text-secondary)",
              background: modalForm.url ? "var(--primary-pale)" : "white",
              transition: "all 0.2s",
            }}>
              <input
                type="file"
                accept=".pdf"
                style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFichier(f); }}
              />
              {upload ? (
                <span>⏳ Upload en cours…</span>
              ) : modalForm.nomFichier ? (
                <>
                  <span className="ms" style={{ fontSize: 18 }}>description</span>
                  <span style={{ fontWeight: 600, color: "var(--primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{modalForm.nomFichier}</span>
                  <span style={{ fontSize: 12, flexShrink: 0 }}>Changer →</span>
                </>
              ) : (
                <>
                  <span className="ms" style={{ fontSize: 18 }}>folder_open</span>
                  <span>Clique pour choisir un PDF…</span>
                </>
              )}
            </label>

            {erreurForm && <div style={{ fontSize: 13, color: "#DC2626", marginBottom: 12 }}>{erreurForm}</div>}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn-ghost" onClick={() => setModalForm(null)} style={{ fontSize: 14 }}>Annuler</button>
              <button
                className="btn-primary"
                onClick={sauvegarder}
                disabled={enSauvegarde || upload}
                style={{ fontSize: 14, minWidth: 110 }}
              >
                {enSauvegarde ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════ MODAL IMPORT EN LOT ════ */}
      {modalLot && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget && !lotEnCours) { setModalLot(false); setLotFichiers([]); } }}
        >
          <div style={{ background: "white", borderRadius: 16, padding: 28, width: "100%", maxWidth: 680, maxHeight: "90vh", overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}><span className="ms" style={{ fontSize: 18, verticalAlign: "middle" }}>download</span> Import en lot</h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 20px" }}>
              Sélectionne plusieurs PDFs. Complète les infos puis clique sur &quot;Importer tout&quot;.
            </p>

            {/* ── Valeurs par défaut ── */}
            <div style={{ background: "var(--bg)", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Par défaut pour tous les fichiers
                </span>
                {lotFichiers.length > 0 && (
                  <button
                    onClick={appliquerDefautATous}
                    disabled={lotEnCours}
                    style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}
                  >
                    Appliquer à tous →
                  </button>
                )}
              </div>

              {/* Matière par défaut */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                {MATIERES.map((m) => {
                  const sel = lotDefautMatiere === m;
                  return (
                    <button
                      key={m}
                      onClick={() => setLotDefautMatiere(m)}
                      style={{
                        padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: sel ? 700 : 500,
                        border: `1.5px solid ${sel ? (couleurTexteM(m) ?? "var(--primary)") : "var(--border)"}`,
                        background: sel ? (couleurBgM(m) ?? "var(--primary-pale)") : "white",
                        color: sel ? (couleurTexteM(m) ?? "var(--primary)") : "var(--text-secondary)",
                        cursor: "pointer",
                      }}
                    >
                      {iconeM(m)} {m}
                    </button>
                  );
                })}
              </div>

              {/* Année par défaut */}
              <div style={{ display: "flex", gap: 6 }}>
                {([null, 1, 2] as const).map((a) => {
                  const sel = lotDefautAnnee === a;
                  const label = a === null ? "Année —" : `Année ${a}`;
                  const color = a === 1 ? "#15803D" : a === 2 ? "#1D4ED8" : undefined;
                  const bg = a === 1 ? "#D1FAE5" : a === 2 ? "#DBEAFE" : undefined;
                  return (
                    <button
                      key={String(a)}
                      onClick={() => setLotDefautAnnee(a)}
                      style={{
                        padding: "3px 12px", borderRadius: 999, fontSize: 12, fontWeight: sel ? 700 : 500,
                        border: `1.5px solid ${sel ? (color ?? "var(--border)") : "var(--border)"}`,
                        background: sel ? (bg ?? "var(--primary-pale)") : "white",
                        color: sel ? (color ?? "var(--text)") : "var(--text-secondary)",
                        cursor: "pointer",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Zone de sélection */}
            <label
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "20px",
                border: "2px dashed var(--border)", borderRadius: 12, cursor: "pointer",
                marginBottom: lotFichiers.length > 0 ? 20 : 0, background: "var(--bg)",
                fontSize: 14, color: "var(--text-secondary)", transition: "border-color 0.2s",
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); ajouterFichiersLot(Array.from(e.dataTransfer.files).filter((f) => f.type === "application/pdf")); }}
            >
              <input
                type="file"
                accept=".pdf"
                multiple
                style={{ display: "none" }}
                onChange={(e) => ajouterFichiersLot(Array.from(e.target.files ?? []))}
              />
              <span className="ms" style={{ fontSize: 28 }}>folder_open</span>
              <span style={{ fontWeight: 600 }}>Clique ou glisse tes PDFs ici</span>
              <span style={{ fontSize: 12 }}>Tu peux sélectionner plusieurs fichiers à la fois</span>
            </label>

            {/* Liste des fichiers */}
            {lotFichiers.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                {lotFichiers.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px",
                      background: item.etat === "done" ? "#F0FDF4" : item.etat === "erreur" ? "#FEF2F2" : "white",
                      transition: "background 0.2s",
                    }}
                  >
                    {/* Titre */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span className="ms" style={{ fontSize: 16, flexShrink: 0 }}>
                        {item.etat === "done" ? "check_circle" : item.etat === "erreur" ? "error" : (item.etat === "upload" || item.etat === "sauvegarde") ? "hourglass_empty" : "description"}
                      </span>
                      <input
                        className="form-input"
                        value={item.titre}
                        onChange={(e) => setLotFichiers((prev) => prev.map((it, i) => i === idx ? { ...it, titre: e.target.value } : it))}
                        placeholder="Titre de la leçon"
                        style={{ flex: 1, fontSize: 13 }}
                        disabled={item.etat === "done" || lotEnCours}
                      />
                      {!lotEnCours && item.etat !== "done" && (
                        <button
                          onClick={() => setLotFichiers((prev) => prev.filter((_, i) => i !== idx))}
                          style={{ width: 22, height: 22, borderRadius: "50%", background: "#FEE2E2", border: "none", color: "#DC2626", fontSize: 14, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}
                        >×</button>
                      )}
                    </div>

                    {/* Matière */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                      {MATIERES.map((m) => {
                        const sel = item.matiere === m;
                        return (
                          <button
                            key={m}
                            onClick={() => setLotFichiers((prev) => prev.map((it, i) => i === idx ? { ...it, matiere: m } : it))}
                            disabled={item.etat === "done" || lotEnCours}
                            style={{
                              padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: sel ? 700 : 500,
                              border: `1.5px solid ${sel ? (couleurTexteM(m) ?? "var(--primary)") : "var(--border)"}`,
                              background: sel ? (couleurBgM(m) ?? "var(--primary-pale)") : "white",
                              color: sel ? (couleurTexteM(m) ?? "var(--primary)") : "var(--text-secondary)",
                              cursor: "pointer",
                            }}
                          >
                            {iconeM(m)} {m}
                          </button>
                        );
                      })}
                    </div>

                    {/* Année */}
                    <div style={{ display: "flex", gap: 5 }}>
                      {([null, 1, 2] as const).map((a) => {
                        const sel = item.annee === a;
                        const label = a === null ? "Année —" : `Année ${a}`;
                        const color = a === 1 ? "#15803D" : a === 2 ? "#1D4ED8" : undefined;
                        const bg = a === 1 ? "#D1FAE5" : a === 2 ? "#DBEAFE" : undefined;
                        return (
                          <button
                            key={String(a)}
                            onClick={() => setLotFichiers((prev) => prev.map((it, i) => i === idx ? { ...it, annee: a } : it))}
                            disabled={item.etat === "done" || lotEnCours}
                            style={{
                              padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: sel ? 700 : 500,
                              border: `1.5px solid ${sel ? (color ?? "var(--border)") : "var(--border)"}`,
                              background: sel ? (bg ?? "var(--primary-pale)") : "white",
                              color: sel ? (color ?? "var(--text)") : "var(--text-secondary)",
                              cursor: "pointer",
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                className="btn-ghost"
                onClick={() => { setModalLot(false); setLotFichiers([]); }}
                disabled={lotEnCours}
                style={{ fontSize: 14 }}
              >
                Fermer
              </button>
              {lotFichiers.length > 0 && (
                <button
                  className="btn-primary"
                  onClick={importerLot}
                  disabled={lotEnCours || lotFichiers.every((it) => it.etat === "done")}
                  style={{ fontSize: 14, minWidth: 150 }}
                >
                  {lotEnCours
                    ? "Import en cours…"
                    : `Importer ${lotFichiers.filter((it) => it.etat === "attente" || it.etat === "erreur").length} leçon(s)`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════ MODAL AFFECTATION ════ */}
      {modalAffect && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget && !enAffect) setModalAffect(null); }}
        >
          <div style={{ background: "white", borderRadius: 16, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}><span className="ms" style={{ fontSize: 18, verticalAlign: "middle" }}>menu_book</span> Affecter la leçon</h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 20px" }}>{modalAffect.titre}</p>

            {/* Date */}
            <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 }}>Date d'assignation</label>
            <input
              type="date"
              className="form-input"
              value={dateAffect}
              onChange={(e) => setDateAffect(e.target.value)}
              style={{ width: "100%", marginBottom: 16 }}
            />

            {/* Groupes */}
            <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 8 }}>Groupes</label>
            {groupes.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>Chargement des groupes…</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                {groupes.map((g) => (
                  <label key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={groupesCoches.has(g.id)}
                      onChange={(e) => {
                        setGroupesCoches((prev) => {
                          const next = new Set(prev);
                          e.target.checked ? next.add(g.id) : next.delete(g.id);
                          return next;
                        });
                      }}
                      style={{ width: 16, height: 16, cursor: "pointer" }}
                    />
                    {g.nom}
                  </label>
                ))}
              </div>
            )}

            {messageAffect && (
              <div style={{ fontSize: 13, color: messageAffect.startsWith("Leçon affectée") ? "#16A34A" : "#DC2626", marginBottom: 12 }}>
                {messageAffect}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn-ghost" onClick={() => setModalAffect(null)} disabled={enAffect} style={{ fontSize: 14 }}>Annuler</button>
              <button
                className="btn-primary"
                onClick={affecter}
                disabled={enAffect || groupesCoches.size === 0}
                style={{ fontSize: 14, minWidth: 110 }}
              >
                {enAffect ? "Affectation…" : "Affecter"}
              </button>
            </div>
          </div>
        </div>
      )}
    </EnseignantLayout>
  );
}
