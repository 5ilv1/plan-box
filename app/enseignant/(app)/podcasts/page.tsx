"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { QCMQuestion } from "@/types";

interface LigneGlobale {
  prenom: string;
  nom: string;
  score_total: number;
  questions_total: number;
  nb_qcm: number;
  pct: number;
}

const MEDAILLES = ["🥇", "🥈", "🥉"];
const COULEURS_PODIUM = ["#F59E0B", "#94A3B8", "#D97706"];
const BG_PODIUM = ["#FEF3C7", "#F1F5F9", "#FEF9F0"];

interface ScoreEleve {
  prenom: string;
  nom: string;
  score: number;
  total: number;
  pct: number;
  eleve_id: string | null;
  repetibox_eleve_id: number | null;
  created_at: string;
}

interface Groupe {
  id: string;
  nom: string;
}

interface Podcast {
  biblio_id?: string;
  qcm_id: string | null;
  titre: string;
  date: string | null;
  contenu: Record<string, unknown>;
  dans_podium: boolean;
  nb_eleves: number;
  scores: ScoreEleve[];
}

// Prochain lundi (ou aujourd'hui si lundi)
function prochainLundi(): string {
  const d = new Date();
  const jour = d.getDay();
  const diff = jour === 0 ? 1 : jour === 1 ? 0 : 8 - jour;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

export default function PodcastsEnseignant() {
  const supabase = createClient();
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [biblio, setBiblio] = useState<Podcast[]>([]);
  const [groupes, setGroupes] = useState<Groupe[]>([]);
  const [chargement, setChargement] = useState(true);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [enseignantId, setEnseignantId] = useState<string | null>(null);

  // Affectation
  const [affecterKey, setAffecterKey] = useState<string | null>(null);
  const [affDate, setAffDate] = useState(prochainLundi());
  const [affGroupeIds, setAffGroupeIds] = useState<Set<string>>(new Set());
  const [affMode, setAffMode] = useState<"classe" | "groupes">("classe");
  const [affEnCours, setAffEnCours] = useState(false);
  const [affResultat, setAffResultat] = useState<string | null>(null);

  // Création
  const [showCreation, setShowCreation] = useState(false);
  const [newTitre, setNewTitre] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newTranscription, setNewTranscription] = useState("");
  const [newMatiere, setNewMatiere] = useState("");
  const [enCreation, setEnCreation] = useState(false);

  // Édition
  const [editPodcast, setEditPodcast] = useState<Podcast | null>(null);
  const [editTitre, setEditTitre] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editMatiere, setEditMatiere] = useState("");
  const [enSauvegarde, setEnSauvegarde] = useState(false);

  // Aperçu
  const [apercuPodcast, setApercuPodcast] = useState<Podcast | null>(null);

  // Suppression
  const [suppression, setSuppression] = useState<string | null>(null);

  // Message
  const [message, setMessage] = useState<string | null>(null);

  // Onglet
  const [onglet, setOnglet] = useState<"podcasts" | "classement">("podcasts");

  // Classement
  const [classement, setClassement] = useState<LigneGlobale[]>([]);
  const [chargementClassement, setChargementClassement] = useState(false);

  const charger = useCallback(async (userId: string) => {
    const [podJson, grpJson] = await Promise.all([
      fetch(`/api/podcasts?enseignant_id=${userId}`).then((r) => r.json()),
      fetch("/api/admin/groupes").then((r) => r.json()),
    ]);
    setPodcasts(podJson.podcasts ?? []);
    setBiblio(podJson.biblio ?? []);
    setGroupes(grpJson.groupes ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setEnseignantId(user.id);
        await charger(user.id);
      }
      setChargement(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function showMsg(msg: string) {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }

  const chargerClassement = useCallback(async () => {
    setChargementClassement(true);
    try {
      const res = await fetch("/api/qcm-reponse?global=true");
      const json = await res.json();
      setClassement(json.classement ?? []);
    } finally {
      setChargementClassement(false);
    }
  }, []);

  useEffect(() => {
    if (onglet === "classement") chargerClassement();
  }, [onglet, chargerClassement]);

  async function togglePodium(qcm_id: string, current: boolean, titre: string) {
    setSaving(qcm_id);
    const newVal = !current;
    setPodcasts((prev) =>
      prev.map((p) => (p.qcm_id === qcm_id ? { ...p, dans_podium: newVal } : p))
    );
    await fetch("/api/podcasts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qcm_id, dans_podium: newVal, titre }),
    }).catch(() => {});
    setSaving(null);
  }

  // ── Création ──
  async function creerPodcast() {
    if (!enseignantId || !newTitre.trim()) return;
    setEnCreation(true);
    try {
      const contenu: Record<string, unknown> = {
        taches: [{
          sous_type: "podcast",
          url: newUrl,
          texte: "",
          label: "",
          transcription: newTranscription,
        }],
        matiere: newMatiere || null,
      };

      const res = await fetch("/api/bibliotheque-ressources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enseignant_id: enseignantId,
          titre: newTitre,
          sous_type: "podcast",
          contenu,
          matiere: newMatiere || null,
        }),
      });
      if (res.ok) {
        showMsg("Podcast ajouté à la bibliothèque");
        setShowCreation(false);
        setNewTitre(""); setNewUrl(""); setNewTranscription(""); setNewMatiere("");
        await charger(enseignantId);
      }
    } finally {
      setEnCreation(false);
    }
  }

  // ── Édition ──
  function ouvrirEdition(p: Podcast) {
    setEditPodcast(p);
    setEditTitre(p.titre);
    const taches = (p.contenu?.taches ?? []) as Array<{ url?: string }>;
    setEditUrl(taches[0]?.url ?? (p.contenu?.url as string) ?? "");
    setEditMatiere((p.contenu?.matiere as string) ?? "");
  }

  async function sauvegarderEdition() {
    if (!editPodcast) return;
    setEnSauvegarde(true);
    try {
      const biblioId = editPodcast.biblio_id;
      if (biblioId) {
        let contenuMaj = { ...editPodcast.contenu };
        const taches = contenuMaj.taches as Array<Record<string, unknown>> | undefined;
        if (taches && taches.length > 0) {
          contenuMaj = { ...contenuMaj, taches: taches.map((t, i) => i === 0 ? { ...t, url: editUrl } : t) };
        }
        contenuMaj = { ...contenuMaj, matiere: editMatiere || null };
        const ancienTitre = editPodcast.titre;
        await fetch(`/api/bibliotheque-ressources/${biblioId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ titre: editTitre, sous_type: "podcast", matiere: editMatiere || null, contenu: contenuMaj }),
        });
        // Si le titre a changé et que le podcast est assigné, mettre à jour plan_travail
        if (editTitre !== ancienTitre && editPodcast.qcm_id) {
          await fetch("/api/podcasts", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ qcm_id: editPodcast.qcm_id, titre: editTitre, dans_podium: editPodcast.dans_podium, renommer: true }),
          });
        }
        showMsg("Podcast mis à jour");
        setEditPodcast(null);
        if (enseignantId) await charger(enseignantId);
      }
    } finally {
      setEnSauvegarde(false);
    }
  }

  // ── Suppression ──
  async function supprimer(p: Podcast) {
    // Supprimer l'entrée bibliothèque si elle existe
    if (p.biblio_id) {
      await fetch(`/api/bibliotheque-ressources/${p.biblio_id}`, { method: "DELETE" });
    }
    // Supprimer les plan_travail liés (si le podcast a été assigné)
    if (p.qcm_id) {
      await fetch(`/api/podcasts?qcm_id=${p.qcm_id}`, { method: "DELETE" });
    }
    showMsg("Podcast supprimé");
    setSuppression(null);
    if (enseignantId) await charger(enseignantId);
  }

  // ── Affectation ──
  function ouvrirAffecter(key: string) {
    setAffecterKey(key);
    setAffDate(prochainLundi());
    setAffGroupeIds(new Set());
    setAffMode("classe");
    setAffResultat(null);
  }

  async function lancerAffectation(podcast: Podcast) {
    setAffEnCours(true);
    setAffResultat(null);

    // Si pas de QCM, en générer un
    let contenu = { ...podcast.contenu };
    if (!contenu.qcm) {
      const taches = (contenu.taches ?? []) as Array<{ sous_type?: string; transcription?: string }>;
      const tacheAvecTranscription = taches.find(
        (t) => t.sous_type === "podcast" && t.transcription && (t.transcription as string).trim().length >= 50
      );
      if (tacheAvecTranscription?.transcription) {
        try {
          const qcmRes = await fetch("/api/generer-qcm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcript: tacheAvecTranscription.transcription, titre: podcast.titre, nbQuestions: 10 }),
          });
          const qcmJson = await qcmRes.json();
          if (qcmRes.ok && qcmJson.questions) {
            contenu = { ...contenu, qcm: qcmJson.questions, qcm_id: qcmJson.qcm_id };
          }
        } catch {}
      }
    }

    const body: Record<string, unknown> = {
      type: "ressource",
      titre: podcast.titre,
      contenu,
      dateAssignation: affDate,
      periodicite: "jour",
      groupeIds: affMode === "classe" ? groupes.map((g) => g.id) : Array.from(affGroupeIds),
    };

    try {
      const res = await fetch("/api/affecter-exercice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.ok) {
        setAffResultat(`Affecté à ${json.nb} élève${json.nb > 1 ? "s" : ""}`);
        setTimeout(() => { setAffecterKey(null); if (enseignantId) charger(enseignantId); }, 2000);
      } else {
        setAffResultat(`Erreur : ${json.erreur ?? "inconnue"}`);
      }
    } catch {
      setAffResultat("Erreur réseau");
    }
    setAffEnCours(false);
  }

  // ── Helpers ──
  const allPodcasts = [...podcasts, ...biblio];
  function podcastKey(p: Podcast) { return p.qcm_id ?? p.biblio_id ?? p.titre; }

  if (chargement) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--pb-on-surface-variant)" }}>
        Chargement des podcasts...
      </div>
    );
  }

  const nbPodium = podcasts.filter((p) => p.dans_podium).length;

  return (
    <div style={{ padding: "0 0 40px" }}>
      {/* Message */}
      {message && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 200, background: "#16A34A", color: "white", padding: "10px 20px", borderRadius: 12, fontWeight: 700, fontSize: 14, boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
          {message}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 4 }}>
            <span className="ms" style={{ fontSize: 28, verticalAlign: "middle", marginRight: 8 }}>podcasts</span>
            Podcasts
          </h1>
          <p style={{ color: "var(--pb-on-surface-variant)", fontSize: 14 }}>
            {allPodcasts.length} podcast{allPodcasts.length > 1 ? "s" : ""} &middot; {nbPodium} dans le podium global
          </p>
        </div>
        <button
          className="btn-primary-sm"
          onClick={() => setShowCreation(true)}
        >
          <span className="ms" style={{ fontSize: 18 }}>add</span>
          Nouveau podcast
        </button>
      </div>

      {/* Onglets */}
      <div style={{ display: "flex", gap: 0, marginBottom: 28, borderBottom: "2px solid var(--pb-outline-variant, #E0E0FF)" }}>
        {([
          { key: "podcasts", label: "Podcasts", icon: "podcasts" },
          { key: "classement", label: "Classement", icon: "emoji_events" },
        ] as const).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setOnglet(key)}
            style={{
              padding: "10px 20px",
              border: "none",
              borderBottom: onglet === key ? "3px solid var(--pb-primary, #0050D4)" : "3px solid transparent",
              background: "transparent",
              color: onglet === key ? "var(--pb-primary, #0050D4)" : "var(--pb-on-surface-variant)",
              fontWeight: onglet === key ? 800 : 600,
              fontSize: 14,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.15s",
              marginBottom: -2,
            }}
          >
            <span className="ms" style={{ fontSize: 18 }}>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* ── Onglet Classement ── */}
      {onglet === "classement" && (
        <ClassementPodcasts
          classement={classement}
          chargement={chargementClassement}
          onRefresh={chargerClassement}
        />
      )}

      {/* Liste */}
      {onglet === "podcasts" && (allPodcasts.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--pb-on-surface-variant)" }}>
          Aucun podcast. Créez-en un avec le bouton ci-dessus.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {allPodcasts.map((p) => {
            const key = podcastKey(p);
            const isOpen = ouvert === key;
            const isAffecting = affecterKey === key;
            const moyennePct = p.scores.length > 0
              ? Math.round(p.scores.reduce((s, e) => s + e.pct, 0) / p.scores.length)
              : 0;
            const isAssigned = !!p.qcm_id;
            const isDeleting = suppression === key;

            return (
              <div
                key={key}
                style={{
                  background: "white",
                  borderRadius: "1rem",
                  border: `1px solid ${!isAssigned ? "rgba(245,158,11,0.3)" : "var(--pb-outline-variant, #E0E0FF)"}`,
                  overflow: "hidden",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                }}
              >
                {/* En-tête */}
                <div
                  onClick={() => setOuvert(isOpen ? null : key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "18px 20px",
                    cursor: "pointer",
                  }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: isAssigned
                      ? (p.dans_podium ? "rgba(245,158,11,0.12)" : "rgba(107,114,128,0.1)")
                      : "rgba(59,130,246,0.1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <span className="ms" style={{ fontSize: 24, color: isAssigned ? (p.dans_podium ? "#F59E0B" : "#9CA3AF") : "#3B82F6" }}>
                      {isAssigned ? (p.dans_podium ? "emoji_events" : "podcasts") : "library_music"}
                    </span>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        fontSize: 15, fontWeight: 700,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {p.titre}
                      </span>
                      {!isAssigned && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#DBEAFE", color: "#1E40AF" }}>
                          Bibliothèque
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", marginTop: 2, display: "flex", gap: 12 }}>
                      {p.date && (
                        <span>{new Date(p.date + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</span>
                      )}
                      {isAssigned && <span>{p.nb_eleves} participant{p.nb_eleves > 1 ? "s" : ""}</span>}
                      {p.nb_eleves > 0 && <span>Moyenne : {moyennePct}%</span>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setApercuPodcast(p)} title="Aperçu" style={btnStyle("#6B7280")}>
                      <span className="ms" style={{ fontSize: 16 }}>visibility</span>
                    </button>
                    {p.biblio_id && (
                      <button onClick={() => ouvrirEdition(p)} title="Modifier" style={btnStyle("#6B7280")}>
                        <span className="ms" style={{ fontSize: 16 }}>edit</span>
                      </button>
                    )}
                    <button onClick={() => ouvrirAffecter(key)} title="Affecter" style={btnStyle("var(--pb-primary, #0050D4)")}>
                      <span className="ms" style={{ fontSize: 16 }}>send</span>
                    </button>
                    {isAssigned && (
                      <button
                        onClick={() => togglePodium(p.qcm_id!, p.dans_podium, p.titre)}
                        disabled={saving === p.qcm_id}
                        title={p.dans_podium ? "Retirer du podium" : "Ajouter au podium"}
                        style={{
                          ...btnStyle(p.dans_podium ? "#F59E0B" : "#9CA3AF"),
                          background: p.dans_podium ? "#FFFBEB" : "white",
                          opacity: saving === p.qcm_id ? 0.5 : 1,
                        }}
                      >
                        <span className="ms" style={{ fontSize: 16 }}>emoji_events</span>
                      </button>
                    )}
                    {isDeleting ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => supprimer(p)} style={{ ...btnStyle("#DC2626"), background: "#DC2626", color: "white", border: "none", fontSize: 12, padding: "4px 10px" }}>Confirmer</button>
                        <button onClick={() => setSuppression(null)} style={{ ...btnStyle("#6B7280"), fontSize: 12, padding: "4px 8px" }}>✕</button>
                      </div>
                    ) : (
                      <button onClick={() => setSuppression(key)} title="Supprimer" style={btnStyle("#DC2626")}>
                        <span className="ms" style={{ fontSize: 16 }}>delete</span>
                      </button>
                    )}
                  </div>

                  <span className="ms" style={{
                    fontSize: 20, color: "var(--pb-on-surface-variant)",
                    transition: "transform 0.2s",
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    flexShrink: 0,
                  }}>
                    expand_more
                  </span>
                </div>

                {/* Panneau affectation */}
                {isAffecting && (
                  <AffectationPanel
                    podcast={p}
                    groupes={groupes}
                    affDate={affDate}
                    setAffDate={setAffDate}
                    affMode={affMode}
                    setAffMode={setAffMode}
                    affGroupeIds={affGroupeIds}
                    setAffGroupeIds={setAffGroupeIds}
                    affEnCours={affEnCours}
                    affResultat={affResultat}
                    onAffecter={() => lancerAffectation(p)}
                    onCancel={() => setAffecterKey(null)}
                  />
                )}

                {/* Scores */}
                {isOpen && isAssigned && (
                  <div style={{
                    borderTop: "1px solid var(--pb-outline-variant, #E0E0FF)",
                    padding: "16px 20px",
                    background: "var(--pb-surface-low, #FAFAFE)",
                  }}>
                    {p.scores.length === 0 ? (
                      <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", textAlign: "center", padding: "12px 0" }}>
                        Aucun élève n'a encore répondu.
                      </p>
                    ) : (
                      <ScoresTable scores={p.scores} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* ── Modal création ── */}
      {showCreation && (
        <Modal onClose={() => setShowCreation(false)} title="Nouveau podcast">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="Titre *">
              <input className="form-input" value={newTitre} onChange={(e) => setNewTitre(e.target.value)} placeholder="Ex : Rosa Bouglione, le cirque dans la peau" style={{ width: "100%", fontSize: 14 }} />
            </Field>
            <Field label="URL du podcast">
              <input className="form-input" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://..." style={{ width: "100%", fontSize: 14 }} />
            </Field>
            <Field label="Matière (optionnel)">
              <input className="form-input" value={newMatiere} onChange={(e) => setNewMatiere(e.target.value)} placeholder="Ex : Histoire, Sciences…" style={{ width: "100%", fontSize: 14 }} />
            </Field>
            <Field label="Transcription (optionnel)">
              <textarea
                className="form-input"
                value={newTranscription}
                onChange={(e) => setNewTranscription(e.target.value)}
                placeholder="Colle ici la transcription ou le résumé du podcast…"
                rows={5}
                style={{ width: "100%", fontSize: 14, resize: "vertical" }}
              />
              {newTranscription.trim().length >= 50 && (
                <div style={{ fontSize: 12, color: "#16A34A", marginTop: 4, fontWeight: 600 }}>
                  Un QCM de 10 questions sera généré automatiquement lors de l'affectation.
                </div>
              )}
            </Field>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
            <button className="btn-ghost" onClick={() => setShowCreation(false)} style={{ fontSize: 14 }}>Annuler</button>
            <button
              className="btn-primary"
              onClick={creerPodcast}
              disabled={enCreation || !newTitre.trim()}
              style={{ fontSize: 14, opacity: enCreation || !newTitre.trim() ? 0.5 : 1 }}
            >
              {enCreation ? "Création…" : "Créer le podcast"}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal édition ── */}
      {editPodcast && (
        <Modal onClose={() => setEditPodcast(null)} title="Modifier le podcast">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="Titre">
              <input className="form-input" value={editTitre} onChange={(e) => setEditTitre(e.target.value)} style={{ width: "100%", fontSize: 14 }} />
            </Field>
            <Field label="URL du podcast">
              <input className="form-input" value={editUrl} onChange={(e) => setEditUrl(e.target.value)} placeholder="https://…" style={{ width: "100%", fontSize: 14 }} />
            </Field>
            <Field label="Matière (optionnel)">
              <input className="form-input" value={editMatiere} onChange={(e) => setEditMatiere(e.target.value)} placeholder="Ex : Histoire…" style={{ width: "100%", fontSize: 14 }} />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
            <button className="btn-ghost" onClick={() => setEditPodcast(null)} style={{ fontSize: 14 }}>Annuler</button>
            <button className="btn-primary" onClick={sauvegarderEdition} disabled={enSauvegarde || !editTitre.trim()} style={{ fontSize: 14 }}>
              {enSauvegarde ? "…" : "Enregistrer"}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal aperçu ── */}
      {apercuPodcast && (() => {
        const taches = (apercuPodcast.contenu?.taches ?? [{ sous_type: "podcast", url: apercuPodcast.contenu?.url, texte: apercuPodcast.contenu?.texte }]) as Array<Record<string, unknown>>;
        const qcm = (apercuPodcast.contenu?.qcm ?? []) as QCMQuestion[];
        return (
          <div
            onClick={() => setApercuPodcast(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: "white", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.20)", width: "100%", maxWidth: 560, maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
            >
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--pb-outline-variant)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--pb-on-surface-variant)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
                    Vue élève — Podcast
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{apercuPodcast.titre}</div>
                </div>
                <button onClick={() => setApercuPodcast(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--pb-on-surface-variant)", padding: "4px 8px" }}>✕</button>
              </div>

              <div style={{ padding: "20px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
                {taches.map((t, i) => (
                  <div key={i} style={{ padding: 16, borderRadius: 12, background: "var(--pb-surface-low, #F5F5FF)", border: "1px solid var(--pb-outline-variant, #E0E0FF)" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                      <span className="ms" style={{ fontSize: 18 }}>podcasts</span>
                      {(t.label as string) || "Écouter le podcast"}
                    </div>
                    {t.url ? (
                      <div style={{ fontSize: 12, color: "var(--pb-primary)", wordBreak: "break-all" }}>
                        <span className="ms" style={{ fontSize: 12, verticalAlign: "middle" }}>link</span> {String(t.url)}
                      </div>
                    ) : null}
                    {t.texte ? <div style={{ fontSize: 13, marginTop: 6 }}>{String(t.texte)}</div> : null}
                  </div>
                ))}

                {qcm.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--pb-on-surface-variant)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                      Questionnaire ({qcm.length} question{qcm.length > 1 ? "s" : ""})
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {qcm.map((q, qi) => (
                        <div key={qi} style={{ padding: "14px 16px", borderRadius: 12, background: "white", border: "1px solid var(--pb-outline-variant)" }}>
                          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>
                            {qi + 1}. {q.question}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {q.options.map((opt, oi) => (
                              <div key={oi} style={{
                                padding: "8px 12px", borderRadius: 8, fontSize: 13,
                                background: oi === q.reponse_correcte ? "#D1FAE5" : "var(--pb-surface-low, #F5F5FF)",
                                border: `1px solid ${oi === q.reponse_correcte ? "#6EE7B7" : "var(--pb-outline-variant)"}`,
                                color: oi === q.reponse_correcte ? "#065F46" : "var(--pb-on-surface)",
                                fontWeight: oi === q.reponse_correcte ? 600 : 400,
                              }}>
                                <span style={{ fontSize: 11, fontWeight: 700, marginRight: 8 }}>
                                  {oi === q.reponse_correcte ? "✓" : String.fromCharCode(65 + oi)}
                                </span>
                                {opt}
                              </div>
                            ))}
                          </div>
                          {q.explication && (
                            <div style={{ marginTop: 8, padding: "8px 10px", background: "#FEF9C3", borderRadius: 6, fontSize: 12, color: "#713F12" }}>
                              {q.explication}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ padding: "12px 20px", borderTop: "1px solid var(--pb-outline-variant)", display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
                <button className="btn-secondary" onClick={() => setApercuPodcast(null)} style={{ padding: "6px 16px", fontSize: 13, borderRadius: 6 }}>Fermer</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Sous-composants ──

function btnStyle(color: string): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 32, height: 32, borderRadius: 8,
    border: `1px solid ${color}20`,
    background: `${color}08`,
    color, cursor: "pointer",
    transition: "all 0.15s",
  };
}

function Modal({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24 }} onClick={onClose}>
      <div className="card" style={{ width: "100%", maxWidth: 480, padding: "24px 22px", background: "white", borderRadius: 16 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>{title}</h3>
          <button className="btn-ghost" onClick={onClose} style={{ padding: "4px 10px" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--pb-on-surface-variant)", marginBottom: 4, display: "block" }}>{label}</label>
      {children}
    </div>
  );
}

function ScoresTable({ scores }: { scores: ScoreEleve[] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: "2px solid var(--pb-outline-variant, #E0E0FF)" }}>
          <th style={{ textAlign: "left", padding: "8px 0", fontWeight: 700, color: "var(--pb-on-surface-variant)" }}>#</th>
          <th style={{ textAlign: "left", padding: "8px 0", fontWeight: 700, color: "var(--pb-on-surface-variant)" }}>Élève</th>
          <th style={{ textAlign: "center", padding: "8px 0", fontWeight: 700, color: "var(--pb-on-surface-variant)" }}>Score</th>
          <th style={{ textAlign: "center", padding: "8px 0", fontWeight: 700, color: "var(--pb-on-surface-variant)" }}>%</th>
          <th style={{ textAlign: "right", padding: "8px 0", fontWeight: 700, color: "var(--pb-on-surface-variant)" }}>Date</th>
        </tr>
      </thead>
      <tbody>
        {scores.map((s, i) => {
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
          return (
            <tr key={i} style={{ borderBottom: "1px solid var(--pb-outline-variant, #F0F0F8)" }}>
              <td style={{ padding: "10px 0", width: 40 }}>{medal || (i + 1)}</td>
              <td style={{ padding: "10px 0", fontWeight: 600 }}>{s.prenom} {s.nom}</td>
              <td style={{ padding: "10px 0", textAlign: "center" }}>{s.score}/{s.total}</td>
              <td style={{ padding: "10px 0", textAlign: "center" }}>
                <span style={{
                  display: "inline-block", padding: "2px 10px", borderRadius: 999,
                  fontSize: 12, fontWeight: 700,
                  background: s.pct >= 70 ? "#DCFCE7" : s.pct >= 40 ? "#FEF3C7" : "#FEE2E2",
                  color: s.pct >= 70 ? "#166534" : s.pct >= 40 ? "#92400E" : "#991B1B",
                }}>
                  {s.pct}%
                </span>
              </td>
              <td style={{ padding: "10px 0", textAlign: "right", color: "var(--pb-on-surface-variant)", fontSize: 12 }}>
                {new Date(s.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AffectationPanel({
  podcast, groupes, affDate, setAffDate, affMode, setAffMode, affGroupeIds, setAffGroupeIds, affEnCours, affResultat, onAffecter, onCancel,
}: {
  podcast: Podcast; groupes: Groupe[];
  affDate: string; setAffDate: (d: string) => void;
  affMode: "classe" | "groupes"; setAffMode: (m: "classe" | "groupes") => void;
  affGroupeIds: Set<string>; setAffGroupeIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  affEnCours: boolean; affResultat: string | null;
  onAffecter: () => void; onCancel: () => void;
}) {
  return (
    <div style={{
      borderTop: "1px solid var(--pb-outline-variant, #E0E0FF)",
      padding: "20px",
      background: "rgba(0,80,212,0.03)",
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <span className="ms" style={{ fontSize: 18, verticalAlign: "middle", marginRight: 6 }}>send</span>
        Affecter ce podcast
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--pb-on-surface-variant)", display: "block", marginBottom: 4 }}>
          Semaine du (lundi)
        </label>
        <input
          type="date"
          value={affDate}
          onChange={(e) => setAffDate(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid var(--pb-outline-variant, #D1D5DB)", fontSize: 14, fontFamily: "inherit" }}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--pb-on-surface-variant)", display: "block", marginBottom: 6 }}>
          Affecter à
        </label>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {(["classe", "groupes"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setAffMode(m)}
              style={{
                padding: "6px 16px", borderRadius: 999,
                border: `1.5px solid ${affMode === m ? "var(--pb-primary)" : "#D1D5DB"}`,
                background: affMode === m ? "var(--pb-primary)" : "white",
                color: affMode === m ? "white" : "var(--pb-on-surface)",
                fontSize: 13, fontWeight: 700, cursor: "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              {m === "classe" ? "Toute la classe" : "Groupe(s)"}
            </button>
          ))}
        </div>
        {affMode === "groupes" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {groupes.map((g) => (
              <button
                key={g.id}
                onClick={() => setAffGroupeIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(g.id)) next.delete(g.id); else next.add(g.id);
                  return next;
                })}
                style={{
                  padding: "5px 14px", borderRadius: 999,
                  border: `1.5px solid ${affGroupeIds.has(g.id) ? "var(--pb-primary)" : "#E0E0FF"}`,
                  background: affGroupeIds.has(g.id) ? "rgba(0,80,212,0.08)" : "white",
                  color: affGroupeIds.has(g.id) ? "var(--pb-primary)" : "var(--pb-on-surface)",
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                {g.nom}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={onAffecter}
          disabled={affEnCours || (affMode === "groupes" && affGroupeIds.size === 0)}
          style={{
            padding: "10px 24px", borderRadius: 999,
            background: "var(--pb-primary, #0050D4)", color: "white",
            border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            opacity: affEnCours || (affMode === "groupes" && affGroupeIds.size === 0) ? 0.5 : 1,
          }}
        >
          {affEnCours ? "Affectation..." : "Affecter"}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: "10px 20px", borderRadius: 999,
            background: "transparent", color: "var(--pb-on-surface-variant)",
            border: "1.5px solid var(--pb-outline-variant, #D1D5DB)",
            fontSize: 14, fontWeight: 600, cursor: "pointer",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          Annuler
        </button>
        {affResultat && (
          <span style={{ fontSize: 13, fontWeight: 700, color: affResultat.startsWith("Erreur") ? "#DC2626" : "#16A34A" }}>
            {affResultat}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Classement global podcasts ─────────────────────────────────────────────

function ClassementPodcasts({
  classement, chargement, onRefresh,
}: {
  classement: LigneGlobale[];
  chargement: boolean;
  onRefresh: () => void;
}) {
  if (chargement) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton" style={{ height: 56, borderRadius: 12 }} />
        ))}
      </div>
    );
  }

  if (classement.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--pb-on-surface-variant)" }}>
        <span className="ms" style={{ fontSize: 48, display: "block", marginBottom: 16, opacity: 0.3 }}>emoji_events</span>
        <p style={{ fontSize: 15, fontWeight: 600 }}>Aucun résultat pour le moment.</p>
        <p style={{ fontSize: 13, marginTop: 6 }}>Les élèves doivent d'abord répondre à un podcast pour apparaître ici.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)" }}>
          {classement.length} élève{classement.length > 1 ? "s" : ""} au classement
        </p>
        <button onClick={onRefresh} className="btn-ghost" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          <span className="ms" style={{ fontSize: 16 }}>refresh</span>
          Actualiser
        </button>
      </div>

      {/* Podium top 3 */}
      {classement.length >= 1 && (
        <div style={{
          display: "flex", alignItems: "flex-end", justifyContent: "center",
          gap: 10, marginBottom: 32,
        }}>
          {/* 2ème */}
          {classement[1] && (
            <PodiumCase
              rang={2} nom={classement[1].prenom}
              score={classement[1].score_total} total={classement[1].questions_total}
              nbQcm={classement[1].nb_qcm} pct={classement[1].pct}
              hauteur={90} medaille={MEDAILLES[1]}
              couleur={COULEURS_PODIUM[1]} bg={BG_PODIUM[1]}
            />
          )}
          {/* 1er */}
          <PodiumCase
            rang={1} nom={classement[0].prenom}
            score={classement[0].score_total} total={classement[0].questions_total}
            nbQcm={classement[0].nb_qcm} pct={classement[0].pct}
            hauteur={120} medaille={MEDAILLES[0]}
            couleur={COULEURS_PODIUM[0]} bg={BG_PODIUM[0]}
          />
          {/* 3ème */}
          {classement[2] && (
            <PodiumCase
              rang={3} nom={classement[2].prenom}
              score={classement[2].score_total} total={classement[2].questions_total}
              nbQcm={classement[2].nb_qcm} pct={classement[2].pct}
              hauteur={70} medaille={MEDAILLES[2]}
              couleur={COULEURS_PODIUM[2]} bg={BG_PODIUM[2]}
            />
          )}
        </div>
      )}

      {/* Liste complète */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {classement.map((ligne, i) => {
          const podium = i < 3;
          return (
            <div
              key={i}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 16px", borderRadius: 12,
                background: podium ? BG_PODIUM[i] : "white",
                border: `1.5px solid ${podium ? COULEURS_PODIUM[i] + "55" : "var(--pb-outline-variant, #E0E0FF)"}`,
                boxShadow: podium ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: podium ? COULEURS_PODIUM[i] : "var(--pb-surface-low, #F5F5FF)",
                fontSize: podium ? 18 : 13, fontWeight: 800,
                color: podium ? "white" : "var(--pb-on-surface-variant)",
              }}>
                {podium ? MEDAILLES[i] : i + 1}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{ligne.prenom} {ligne.nom}</div>
                <div style={{ height: 4, background: "var(--pb-outline-variant, #E0E0FF)", borderRadius: 999, marginTop: 4, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${ligne.pct}%`,
                    background: ligne.pct === 100 ? "#16A34A" : ligne.pct >= 70 ? "#2563EB" : "#F59E0B",
                    borderRadius: 999, transition: "width 0.5s ease",
                  }} />
                </div>
                <div style={{ fontSize: 11, color: "var(--pb-on-surface-variant)", marginTop: 3 }}>
                  {ligne.nb_qcm} podcast{ligne.nb_qcm > 1 ? "s" : ""} · {ligne.score_total}/{ligne.questions_total} questions
                </div>
              </div>

              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: podium ? COULEURS_PODIUM[i] : "var(--pb-on-surface)" }}>
                  {ligne.pct}%
                </div>
                <div style={{ fontSize: 11, color: "var(--pb-on-surface-variant)", fontWeight: 600 }}>
                  {ligne.score_total} pts
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PodiumCase({
  nom, score, total, nbQcm, pct, hauteur, medaille, couleur, bg,
}: {
  rang: number; nom: string; score: number; total: number; nbQcm: number; pct: number;
  hauteur: number; medaille: string; couleur: string; bg: string;
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ fontSize: 26 }}>{medaille}</div>
      <div style={{
        fontSize: 13, fontWeight: 700,
        textAlign: "center", maxWidth: 80,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {nom}
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: couleur }}>{score} pts</div>
      <div style={{ fontSize: 10, color: "var(--pb-on-surface-variant)" }}>{nbQcm} podcast{nbQcm > 1 ? "s" : ""}</div>
      <div style={{
        width: "100%", height: hauteur,
        background: bg, border: `2px solid ${couleur}55`,
        borderRadius: "8px 8px 0 0",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16, fontWeight: 900, color: couleur,
      }}>
        {pct}%
      </div>
    </div>
  );
}
