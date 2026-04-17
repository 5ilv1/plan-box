"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

interface LectureQuestion {
  id?: number;
  question: string;
  choix: string[];
  reponse: number;
}

interface LectureContenu {
  titre: string;
  texte: string;
  questions: LectureQuestion[];
  est_evaluation_finale?: boolean;
}

interface Exercice {
  id: string;
  chapitre_id: string;
  ordre: number;
  titre: string;
  type: string;
  contenu: LectureContenu;
  nb_questions: number | null;
  created_at: string;
}

interface Chapitre {
  id: string;
  titre: string;
  matiere: string;
  sous_matiere?: string | null;
  niveaux?: { nom: string };
}

interface ChapitreExtrait {
  ordre: number;
  titre: string;
  texte: string;
  nb_mots: number;
  selectionne: boolean;
}

const NIVEAUX_LABEL: Record<string, string> = { CE2: "CE2", CM1: "CM1", CM2: "CM2" };

export default function PageChapitreLectureDetail() {
  const { id: chapitreId } = useParams<{ id: string }>();
  const router = useRouter();

  const [chapitre, setChapitre] = useState<Chapitre | null>(null);
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [chargement, setChargement] = useState(true);

  // Upload livre complet
  const [uploadVisible, setUploadVisible] = useState(false);
  const [pdfLivre, setPdfLivre] = useState<{ name: string; base64: string } | null>(null);
  const [enExtraction, setEnExtraction] = useState(false);
  const [chapitresExtraits, setChapitresExtraits] = useState<ChapitreExtrait[] | null>(null);
  const [enGenerationBatch, setEnGenerationBatch] = useState(false);
  const [progressionBatch, setProgressionBatch] = useState<{ courant: number; total: number } | null>(null);
  const [erreurUpload, setErreurUpload] = useState("");

  // Ajout manuel
  const [ajoutManuelVisible, setAjoutManuelVisible] = useState(false);
  const [ajoutMode, setAjoutMode] = useState<"texte" | "pdf">("texte");
  const [ajoutTitre, setAjoutTitre] = useState("");
  const [ajoutTexte, setAjoutTexte] = useState("");
  const [ajoutPdf, setAjoutPdf] = useState<{ name: string; base64: string } | null>(null);
  const [enAjoutManuel, setEnAjoutManuel] = useState(false);
  const [erreurAjout, setErreurAjout] = useState("");

  // Édition d'un chapitre lu
  const [editionId, setEditionId] = useState<string | null>(null);
  const [editTitre, setEditTitre] = useState("");
  const [editTexte, setEditTexte] = useState("");
  const [editQuestions, setEditQuestions] = useState<LectureQuestion[]>([]);
  const [enSauvegardeEdit, setEnSauvegardeEdit] = useState(false);

  // Évaluation finale
  const [enGenerationEval, setEnGenerationEval] = useState(false);
  const [erreurEval, setErreurEval] = useState("");

  // Suppression
  const [aSupprimer, setASupprimer] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputManuelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapitreId]);

  async function charger() {
    setChargement(true);
    const [chapRes, exRes] = await Promise.all([
      fetch(`/api/admin/chapitres/${chapitreId}`).then((r) => r.json()),
      fetch(`/api/chapitres/exercices?chapitre_id=${chapitreId}`).then((r) => r.json()),
    ]);
    setChapitre(chapRes.chapitre ?? null);
    setExercices((exRes.exercices ?? []) as Exercice[]);
    setChargement(false);
  }

  const niveauLabel = chapitre?.niveaux?.nom ?? "CM1";
  const niveauPourAPI = NIVEAUX_LABEL[niveauLabel] ?? "CM1";

  const chapitresLus = exercices
    .filter((e) => !e.contenu?.est_evaluation_finale)
    .sort((a, b) => a.ordre - b.ordre);
  const evaluationFinale = exercices.find((e) => e.contenu?.est_evaluation_finale) ?? null;

  // ── Upload livre complet ────────────────────────────────────────────────
  function handlePdfLivre(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPdfLivre({ name: file.name, base64: (reader.result as string).split(",")[1] });
      setErreurUpload("");
    };
    reader.readAsDataURL(file);
  }

  async function extraireChapitres() {
    if (!pdfLivre) return;
    setEnExtraction(true);
    setErreurUpload("");
    try {
      const res = await fetch("/api/extraire-chapitres-livre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64: pdfLivre.base64 }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErreurUpload(json.erreur ?? "Erreur lors de l'extraction.");
        return;
      }
      const extraits = (json.resultat.chapitres as Array<{ ordre: number; titre: string; texte: string; nb_mots: number }>).map((c) => ({
        ...c,
        selectionne: true,
      }));
      setChapitresExtraits(extraits);
    } catch (err) {
      setErreurUpload(err instanceof Error ? err.message : "Erreur réseau.");
    } finally {
      setEnExtraction(false);
    }
  }

  async function genererExercicesBatch() {
    if (!chapitresExtraits) return;
    const selectionnes = chapitresExtraits.filter((c) => c.selectionne);
    if (selectionnes.length === 0) {
      setErreurUpload("Sélectionne au moins un chapitre.");
      return;
    }
    setEnGenerationBatch(true);
    setErreurUpload("");
    setProgressionBatch({ courant: 0, total: selectionnes.length });

    for (let i = 0; i < selectionnes.length; i++) {
      const c = selectionnes[i];
      setProgressionBatch({ courant: i + 1, total: selectionnes.length });
      try {
        const genRes = await fetch("/api/generer-lecture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            niveau: niveauPourAPI,
            texte: c.texte,
            titre: c.titre,
            adaptatif: true,
          }),
        });
        const genJson = await genRes.json();
        if (!genRes.ok) throw new Error(genJson.erreur ?? "Erreur de génération");

        // Créer l'exercice
        await fetch("/api/chapitres/exercices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chapitre_id: chapitreId,
            titre: c.titre,
            type: "lecture",
            contenu: {
              titre: c.titre,
              texte: c.texte,
              questions: genJson.resultat.questions,
            },
            nb_questions: genJson.resultat.questions.length,
          }),
        });
      } catch (err) {
        console.error("[batch]", c.titre, err);
        setErreurUpload(`Échec sur "${c.titre}" : ${err instanceof Error ? err.message : "erreur"}. Les précédents ont été sauvegardés.`);
        break;
      }
    }

    setProgressionBatch(null);
    setEnGenerationBatch(false);
    setChapitresExtraits(null);
    setPdfLivre(null);
    setUploadVisible(false);
    await charger();
  }

  // ── Ajout manuel ─────────────────────────────────────────────────────────
  function handlePdfManuel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAjoutPdf({ name: file.name, base64: (reader.result as string).split(",")[1] });
    reader.readAsDataURL(file);
  }

  async function ajouterManuel() {
    if (!ajoutTitre.trim()) { setErreurAjout("Titre du chapitre requis."); return; }
    if (ajoutMode === "texte" && !ajoutTexte.trim()) { setErreurAjout("Colle le texte du chapitre."); return; }
    if (ajoutMode === "pdf" && !ajoutPdf) { setErreurAjout("Ajoute un PDF."); return; }

    setEnAjoutManuel(true);
    setErreurAjout("");
    try {
      const genRes = await fetch("/api/generer-lecture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niveau: niveauPourAPI,
          texte: ajoutMode === "texte" ? ajoutTexte : undefined,
          pdfBase64: ajoutMode === "pdf" ? ajoutPdf?.base64 : undefined,
          titre: ajoutTitre,
          adaptatif: true,
        }),
      });
      const genJson = await genRes.json();
      if (!genRes.ok) throw new Error(genJson.erreur ?? "Erreur de génération");

      await fetch("/api/chapitres/exercices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapitre_id: chapitreId,
          titre: ajoutTitre,
          type: "lecture",
          contenu: {
            titre: ajoutTitre,
            texte: genJson.resultat.texte ?? ajoutTexte,
            questions: genJson.resultat.questions,
          },
          nb_questions: genJson.resultat.questions.length,
        }),
      });

      setAjoutTitre("");
      setAjoutTexte("");
      setAjoutPdf(null);
      setAjoutManuelVisible(false);
      await charger();
    } catch (err) {
      setErreurAjout(err instanceof Error ? err.message : "Erreur");
    } finally {
      setEnAjoutManuel(false);
    }
  }

  // ── Édition chapitre lu ──────────────────────────────────────────────────
  function ouvrirEdition(ex: Exercice) {
    setEditionId(ex.id);
    setEditTitre(ex.titre);
    setEditTexte(ex.contenu.texte ?? "");
    setEditQuestions(JSON.parse(JSON.stringify(ex.contenu.questions ?? [])));
  }

  async function sauvegarderEdition() {
    if (!editionId) return;
    setEnSauvegardeEdit(true);
    const ex = exercices.find((e) => e.id === editionId);
    if (!ex) return;
    await fetch("/api/chapitres/exercices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editionId,
        titre: editTitre,
        contenu: {
          ...ex.contenu,
          titre: editTitre,
          texte: editTexte,
          questions: editQuestions,
        },
        nb_questions: editQuestions.length,
      }),
    });
    setEditionId(null);
    setEnSauvegardeEdit(false);
    await charger();
  }

  async function supprimerExercice(id: string) {
    await fetch(`/api/chapitres/exercices?id=${id}`, { method: "DELETE" });
    setASupprimer(null);
    await charger();
  }

  // ── Évaluation finale ────────────────────────────────────────────────────
  async function genererEvaluationFinale() {
    if (chapitresLus.length < 2) {
      setErreurEval("Il faut au moins 2 chapitres lus pour générer l'évaluation.");
      return;
    }
    setEnGenerationEval(true);
    setErreurEval("");
    try {
      const res = await fetch("/api/generer-eval-lecture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titreLivre: chapitre?.titre,
          niveau: niveauPourAPI,
          chapitres: chapitresLus.map((e) => ({ titre: e.titre, texte: e.contenu.texte ?? "" })),
          nbQuestions: 10,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erreur ?? "Erreur");

      // Supprimer l'ancienne eval si existe
      if (evaluationFinale) {
        await fetch(`/api/chapitres/exercices?id=${evaluationFinale.id}`, { method: "DELETE" });
      }
      // Créer nouvelle eval
      await fetch("/api/chapitres/exercices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapitre_id: chapitreId,
          titre: json.resultat.titre,
          type: "lecture",
          contenu: {
            titre: json.resultat.titre,
            texte: "",
            questions: json.resultat.questions,
            est_evaluation_finale: true,
          },
          nb_questions: json.resultat.questions.length,
        }),
      });
      await charger();
    } catch (err) {
      setErreurEval(err instanceof Error ? err.message : "Erreur");
    } finally {
      setEnGenerationEval(false);
    }
  }

  // ── Rendu ────────────────────────────────────────────────────────────────
  if (chargement) {
    return (
      <div className="page">
        <div className="container" style={{ maxWidth: 900 }}>
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-secondary)" }}>Chargement…</div>
        </div>
      </div>
    );
  }

  if (!chapitre) {
    return (
      <div className="page">
        <div className="container" style={{ maxWidth: 900 }}>
          <p>Chapitre introuvable.</p>
          <Link href="/enseignant/admin/chapitres" className="btn-secondary">← Retour</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 900 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <Link
            href="/enseignant/admin/chapitres"
            style={{ fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" }}
          >
            ← Chapitres
          </Link>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 26 }}>📖</span>
              <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{chapitre.titre}</h1>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              Chapitre lecture · {niveauLabel} · {chapitresLus.length} chapitre{chapitresLus.length > 1 ? "s" : ""} du livre
              {evaluationFinale ? " · évaluation finale prête" : ""}
            </div>
          </div>
        </div>

        {/* Actions principales */}
        {!uploadVisible && !ajoutManuelVisible && (
          <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
            <button
              className="btn-primary"
              onClick={() => setUploadVisible(true)}
              style={{ background: "#7C3AED", borderColor: "#7C3AED", display: "flex", alignItems: "center", gap: 6 }}
            >
              <span className="ms" style={{ fontSize: 18 }}>upload_file</span>
              Uploader le livre complet (PDF)
            </button>
            <button
              className="btn-secondary"
              onClick={() => setAjoutManuelVisible(true)}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <span className="ms" style={{ fontSize: 18 }}>add</span>
              Ajouter un chapitre manuellement
            </button>
          </div>
        )}

        {/* Upload livre complet */}
        {uploadVisible && (
          <div className="card" style={{ padding: 20, marginBottom: 24, borderLeft: "4px solid #7C3AED" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>📚 Uploader le livre complet</h3>
              <button
                onClick={() => { setUploadVisible(false); setPdfLivre(null); setChapitresExtraits(null); setErreurUpload(""); }}
                className="btn-ghost"
                style={{ padding: "4px 10px", fontSize: 12 }}
                disabled={enExtraction || enGenerationBatch}
              >
                Fermer
              </button>
            </div>

            {erreurUpload && (
              <div style={{ background: "#FEE2E2", color: "#DC2626", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
                {erreurUpload}
              </div>
            )}

            {!chapitresExtraits ? (
              <>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                  Charge le PDF complet du livre. L'IA détectera les chapitres et extraira le texte de chacun. Tu valideras la liste avant de générer les QCM.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handlePdfLivre}
                  style={{ marginBottom: 12 }}
                />
                {pdfLivre && (
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                    📄 {pdfLivre.name}
                  </div>
                )}
                <button
                  className="btn-primary"
                  onClick={extraireChapitres}
                  disabled={!pdfLivre || enExtraction}
                  style={{ background: "#7C3AED", borderColor: "#7C3AED" }}
                >
                  {enExtraction ? "Extraction en cours… (peut prendre 1-2 min)" : "Extraire les chapitres"}
                </button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                  <strong>{chapitresExtraits.length} chapitre{chapitresExtraits.length > 1 ? "s" : ""}</strong> détecté{chapitresExtraits.length > 1 ? "s" : ""}. Décoche ceux que tu ne veux pas garder.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14, maxHeight: 360, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8, padding: 8 }}>
                  {chapitresExtraits.map((c, idx) => (
                    <label
                      key={idx}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                        background: c.selectionne ? "rgba(124,58,237,0.05)" : "transparent",
                        borderRadius: 6, cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={c.selectionne}
                        onChange={(e) => {
                          const newList = [...chapitresExtraits];
                          newList[idx] = { ...c, selectionne: e.target.checked };
                          setChapitresExtraits(newList);
                        }}
                        disabled={enGenerationBatch}
                      />
                      <div style={{ flex: 1 }}>
                        <input
                          type="text"
                          value={c.titre}
                          onChange={(e) => {
                            const newList = [...chapitresExtraits];
                            newList[idx] = { ...c, titre: e.target.value };
                            setChapitresExtraits(newList);
                          }}
                          disabled={enGenerationBatch}
                          style={{
                            border: "none", background: "transparent", fontWeight: 600,
                            fontSize: 14, width: "100%", outline: "none", padding: 0,
                          }}
                        />
                        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                          {c.nb_mots} mots
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                {progressionBatch && (
                  <div style={{ marginBottom: 12, background: "rgba(124,58,237,0.08)", padding: "10px 14px", borderRadius: 8, fontSize: 13 }}>
                    Génération des QCM… Chapitre {progressionBatch.courant} / {progressionBatch.total}
                    <div style={{ height: 4, background: "var(--border)", borderRadius: 999, marginTop: 6, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", background: "#7C3AED",
                        width: `${(progressionBatch.courant / progressionBatch.total) * 100}%`,
                        transition: "width 0.3s",
                      }} />
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    className="btn-primary"
                    onClick={genererExercicesBatch}
                    disabled={enGenerationBatch}
                    style={{ background: "#7C3AED", borderColor: "#7C3AED", flex: 1 }}
                  >
                    {enGenerationBatch
                      ? "Génération en cours…"
                      : `✨ Générer ${chapitresExtraits.filter(c => c.selectionne).length} QCM`}
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => { setChapitresExtraits(null); setPdfLivre(null); }}
                    disabled={enGenerationBatch}
                  >
                    Recommencer
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Ajout manuel */}
        {ajoutManuelVisible && (
          <div className="card" style={{ padding: 20, marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>+ Ajouter un chapitre manuellement</h3>
              <button
                onClick={() => { setAjoutManuelVisible(false); setErreurAjout(""); }}
                className="btn-ghost"
                style={{ padding: "4px 10px", fontSize: 12 }}
                disabled={enAjoutManuel}
              >
                Fermer
              </button>
            </div>

            {erreurAjout && (
              <div style={{ background: "#FEE2E2", color: "#DC2626", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
                {erreurAjout}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => setAjoutMode("texte")}
                className={ajoutMode === "texte" ? "btn-primary" : "btn-secondary"}
                style={{ flex: 1, fontSize: 13 }}
              >
                Coller un texte
              </button>
              <button
                type="button"
                onClick={() => setAjoutMode("pdf")}
                className={ajoutMode === "pdf" ? "btn-primary" : "btn-secondary"}
                style={{ flex: 1, fontSize: 13 }}
              >
                Importer un PDF
              </button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Titre du chapitre *</label>
              <input
                type="text"
                className="form-input"
                value={ajoutTitre}
                onChange={(e) => setAjoutTitre(e.target.value)}
                placeholder="Ex. Chapitre 1 — Le départ"
              />
            </div>

            {ajoutMode === "texte" ? (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Texte du chapitre *</label>
                <textarea
                  className="form-input"
                  rows={10}
                  value={ajoutTexte}
                  onChange={(e) => setAjoutTexte(e.target.value)}
                  style={{ resize: "vertical", lineHeight: 1.6 }}
                  placeholder="Colle ici le texte du chapitre…"
                />
                <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                  {ajoutTexte.split(/\s+/).filter(Boolean).length} mots
                </p>
              </div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 5 }}>PDF du chapitre *</label>
                <input
                  ref={fileInputManuelRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handlePdfManuel}
                />
                {ajoutPdf && (
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>
                    📄 {ajoutPdf.name}
                  </div>
                )}
              </div>
            )}

            <button
              className="btn-primary"
              onClick={ajouterManuel}
              disabled={enAjoutManuel}
              style={{ background: "#7C3AED", borderColor: "#7C3AED" }}
            >
              {enAjoutManuel ? "Génération…" : "✨ Générer le QCM"}
            </button>
          </div>
        )}

        {/* Liste chapitres lus */}
        {chapitresLus.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-secondary)" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📖</div>
            <p style={{ marginBottom: 0 }}>
              Aucun chapitre encore. Uploade le livre complet ou ajoute les chapitres un par un.
            </p>
          </div>
        ) : (
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: "var(--text-secondary)" }}>
              Chapitres du livre
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {chapitresLus.map((ex, idx) => (
                <div
                  key={ex.id}
                  className="card"
                  style={{
                    padding: "12px 16px", display: "flex", alignItems: "center", gap: 12,
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: "rgba(124,58,237,0.1)", color: "#7C3AED",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 800, fontSize: 13, flexShrink: 0,
                  }}>
                    {idx + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {ex.titre}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                      {(ex.contenu?.questions?.length ?? 0)} questions · {(ex.contenu?.texte ?? "").split(/\s+/).filter(Boolean).length} mots
                    </div>
                  </div>
                  <button
                    onClick={() => ouvrirEdition(ex)}
                    className="btn-secondary"
                    style={{ padding: "4px 10px", fontSize: 12, borderRadius: 6 }}
                  >
                    Modifier
                  </button>
                  {aSupprimer === ex.id ? (
                    <>
                      <button
                        onClick={() => supprimerExercice(ex.id)}
                        style={{ padding: "4px 10px", fontSize: 12, background: "var(--error)", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}
                      >
                        Confirmer
                      </button>
                      <button
                        onClick={() => setASupprimer(null)}
                        className="btn-ghost"
                        style={{ padding: "3px 8px", fontSize: 12 }}
                      >
                        ✕
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setASupprimer(ex.id)}
                      className="btn-ghost"
                      style={{ padding: "5px 9px", fontSize: 14, color: "var(--text-secondary)" }}
                    >
                      🗑
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section évaluation finale */}
        {chapitresLus.length >= 2 && (
          <div
            className="card"
            style={{
              padding: 20, marginBottom: 24,
              border: "2px dashed #F59E0B",
              background: "#FFFBEB",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 24 }}>🏆</span>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Évaluation finale</h3>
            </div>

            {erreurEval && (
              <div style={{ background: "#FEE2E2", color: "#DC2626", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
                {erreurEval}
              </div>
            )}

            {evaluationFinale ? (
              <>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                  ✓ Évaluation prête — {evaluationFinale.contenu.questions?.length ?? 0} questions portant sur l'ensemble du livre.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    onClick={() => ouvrirEdition(evaluationFinale)}
                    className="btn-secondary"
                    style={{ fontSize: 13 }}
                  >
                    Modifier les questions
                  </button>
                  <button
                    onClick={genererEvaluationFinale}
                    disabled={enGenerationEval}
                    className="btn-secondary"
                    style={{ fontSize: 13 }}
                  >
                    {enGenerationEval ? "Régénération…" : "↻ Régénérer"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                  Génère 10 questions de compréhension globale sur l'ensemble de l'histoire (personnages, intrigue, thèmes). Les questions seront nouvelles et différentes de celles des chapitres.
                </p>
                <button
                  onClick={genererEvaluationFinale}
                  disabled={enGenerationEval}
                  className="btn-primary"
                  style={{ background: "#F59E0B", borderColor: "#F59E0B" }}
                >
                  {enGenerationEval ? "Génération en cours…" : "✨ Générer l'évaluation finale"}
                </button>
              </>
            )}
          </div>
        )}

        {/* Modal édition chapitre ou eval */}
        {editionId && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24,
          }}>
            <div className="card" style={{ width: "100%", maxWidth: 780, padding: "24px", maxHeight: "92vh", overflowY: "auto" }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>
                ✏️ Modifier
              </h2>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Titre</label>
                <input
                  type="text"
                  className="form-input"
                  value={editTitre}
                  onChange={(e) => setEditTitre(e.target.value)}
                />
              </div>

              {/* Texte (masqué pour eval finale) */}
              {!exercices.find((e) => e.id === editionId)?.contenu?.est_evaluation_finale && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Texte du chapitre</label>
                  <textarea
                    className="form-input"
                    rows={8}
                    value={editTexte}
                    onChange={(e) => setEditTexte(e.target.value)}
                    style={{ resize: "vertical", lineHeight: 1.5 }}
                  />
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                  Questions ({editQuestions.length})
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {editQuestions.map((q, qIdx) => (
                    <div
                      key={qIdx}
                      style={{
                        border: "1px solid var(--border)", borderRadius: 8, padding: 12,
                        background: "var(--bg, #F8F9FA)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>
                          Q{qIdx + 1}
                        </span>
                        <button
                          onClick={() => setEditQuestions(editQuestions.filter((_, i) => i !== qIdx))}
                          className="btn-ghost"
                          style={{ padding: "2px 8px", fontSize: 12 }}
                        >
                          🗑
                        </button>
                      </div>
                      <input
                        type="text"
                        className="form-input"
                        value={q.question}
                        onChange={(e) => {
                          const next = [...editQuestions];
                          next[qIdx] = { ...q, question: e.target.value };
                          setEditQuestions(next);
                        }}
                        placeholder="Question"
                        style={{ marginBottom: 8 }}
                      />
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {q.choix.map((ch, cIdx) => (
                          <div key={cIdx} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input
                              type="radio"
                              name={`q-${qIdx}`}
                              checked={q.reponse === cIdx}
                              onChange={() => {
                                const next = [...editQuestions];
                                next[qIdx] = { ...q, reponse: cIdx };
                                setEditQuestions(next);
                              }}
                            />
                            <input
                              type="text"
                              className="form-input"
                              value={ch}
                              onChange={(e) => {
                                const next = [...editQuestions];
                                const newChoix = [...q.choix];
                                newChoix[cIdx] = e.target.value;
                                next[qIdx] = { ...q, choix: newChoix };
                                setEditQuestions(next);
                              }}
                              style={{
                                marginBottom: 0,
                                background: q.reponse === cIdx ? "#DCFCE7" : "white",
                                fontWeight: q.reponse === cIdx ? 600 : 400,
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className="btn-primary"
                  onClick={sauvegarderEdition}
                  disabled={enSauvegardeEdit}
                  style={{ flex: 1 }}
                >
                  {enSauvegardeEdit ? "Sauvegarde…" : "✓ Enregistrer"}
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => setEditionId(null)}
                  disabled={enSauvegardeEdit}
                  style={{ flex: 1 }}
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
