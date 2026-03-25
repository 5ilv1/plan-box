"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { Groupe } from "@/types";
import EnseignantLayout from "@/components/EnseignantLayout";

// Élève unifié : source Plan Box (UUID) ou Repetibox (integer)
interface EleveUnifie {
  uid: string;              // clé unique: "pb_<uuid>" ou "rb_<int>"
  prenom: string;
  nom: string;
  source: "planbox" | "repetibox";
  info: string;             // niveau (PB) ou identifiant (RB)
  raw_uuid?: string;
  raw_int?: number;
}

interface GroupeAvecMembres extends Omit<Groupe, "membres" | "nb_membres"> {
  membres: EleveUnifie[];
}

interface LiaisonDB {
  groupe_id: string;
  planbox_eleve_id: string | null;
  repetibox_eleve_id: number | null;
}

export default function PageGroupes() {
  const router = useRouter();
  const supabase = createClient();

  const [groupes, setGroupes] = useState<GroupeAvecMembres[]>([]);
  const [tousEleves, setTousEleves] = useState<EleveUnifie[]>([]);
  const [chargement, setChargement] = useState(true);
  const [groupeOuvert, setGroupeOuvert] = useState<string | null>(null);

  const [annuaireOuvert, setAnnuaireOuvert] = useState(false);

  const [nomNouveau, setNomNouveau] = useState("");
  const [creationEnCours, setCreationEnCours] = useState(false);

  const [groupeEnEdition, setGroupeEnEdition] = useState<string | null>(null);
  const [nomEdition, setNomEdition] = useState("");

  const [eleveAAjouter, setEleveAAjouter] = useState<Record<string, string>>({});
  const [groupeASupprimer, setGroupeASupprimer] = useState<string | null>(null);
  const [rbErreur, setRbErreur] = useState<string | null>(null);

  const inputCreationRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function charger() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/enseignant"); return; }
      await recharger();
    }
    charger();
  }, []);

  async function recharger() {
    setChargement(true);

    // Les 3 premières requêtes utilisent le client navigateur (RLS normal)
    // La 4e passe par une API route serveur (admin, bypass RLS) pour lire la table eleve de Repetibox
    const [
      { data: grp },
      { data: liaisons },
      { data: pbEleves },
      rbResponse,
    ] = await Promise.all([
      supabase.from("groupes").select("*").order("nom"),
      supabase.from("eleve_groupe").select("groupe_id, planbox_eleve_id, repetibox_eleve_id"),
      supabase.from("eleves").select("*, niveaux(*)").order("nom"),
      fetch("/api/repetibox-eleves").then((r) => r.json()).catch((err) => ({ error: String(err), eleves: [] })),
    ]);

    // Diagnostic si l'API échoue
    const rbEleves: any[] = rbResponse?.eleves ?? [];
    if (rbResponse?.error) {
      console.error("[Plan Box] Erreur /api/repetibox-eleves:", rbResponse.error);
      setRbErreur(rbResponse.error);
    } else {
      setRbErreur(null);
    }

    // Fusion des deux sources en liste unifiée triée par nom
    const unified: EleveUnifie[] = [
      ...(pbEleves ?? []).map((e: any) => ({
        uid: `pb_${e.id}`,
        prenom: e.prenom,
        nom: e.nom,
        source: "planbox" as const,
        info: e.niveaux?.nom ?? "Plan Box",
        raw_uuid: e.id,
      })),
      ...(rbEleves ?? []).map((e: any) => ({
        uid: `rb_${e.id}`,
        prenom: e.prenom,
        nom: e.nom,
        source: "repetibox" as const,
        info: e.identifiant ?? "Repetibox",
        raw_int: e.id,
      })),
    ].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

    setTousEleves(unified);

    // Construction des groupes avec leurs membres unifiés
    const liaisonsData = (liaisons ?? []) as LiaisonDB[];
    const groupesData: GroupeAvecMembres[] = (grp ?? []).map((g: any) => {
      const membresUid = liaisonsData
        .filter((l) => l.groupe_id === g.id)
        .map((l) =>
          l.planbox_eleve_id
            ? `pb_${l.planbox_eleve_id}`
            : `rb_${l.repetibox_eleve_id}`
        );
      const membres = unified.filter((e) => membresUid.includes(e.uid));
      return { ...g, membres };
    });

    setGroupes(groupesData);
    setChargement(false);
  }

  async function creerGroupe(e: React.FormEvent) {
    e.preventDefault();
    const nom = nomNouveau.trim();
    if (!nom) return;
    setCreationEnCours(true);
    await supabase.from("groupes").insert({ nom });
    setNomNouveau("");
    await recharger();
    setCreationEnCours(false);
  }

  async function renommerGroupe(id: string) {
    const nom = nomEdition.trim();
    if (!nom) return;
    await supabase.from("groupes").update({ nom }).eq("id", id);
    setGroupeEnEdition(null);
    await recharger();
  }

  async function supprimerGroupe(id: string) {
    await supabase.from("groupes").delete().eq("id", id);
    setGroupeASupprimer(null);
    if (groupeOuvert === id) setGroupeOuvert(null);
    await recharger();
  }

  async function ajouterMembre(groupeId: string) {
    const uid = eleveAAjouter[groupeId];
    if (!uid) return;
    const eleve = tousEleves.find((e) => e.uid === uid);
    if (!eleve) return;

    const payload =
      eleve.source === "planbox"
        ? { groupe_id: groupeId, planbox_eleve_id: eleve.raw_uuid }
        : { groupe_id: groupeId, repetibox_eleve_id: eleve.raw_int };

    await supabase.from("eleve_groupe").insert(payload);
    setEleveAAjouter((prev) => ({ ...prev, [groupeId]: "" }));
    await recharger();
  }

  async function retirerMembre(uid: string, groupeId: string) {
    const eleve = tousEleves.find((e) => e.uid === uid);
    if (!eleve) return;

    const q = supabase.from("eleve_groupe").delete().eq("groupe_id", groupeId);
    if (eleve.source === "planbox") {
      await q.eq("planbox_eleve_id", eleve.raw_uuid!);
    } else {
      await q.eq("repetibox_eleve_id", eleve.raw_int!);
    }
    await recharger();
  }

  function elevesHorsGroupe(groupe: GroupeAvecMembres): EleveUnifie[] {
    return tousEleves.filter((e) => !groupe.membres.some((m) => m.uid === e.uid));
  }

  const nbPlanBox = tousEleves.filter((e) => e.source === "planbox").length;
  const nbRepetibox = tousEleves.filter((e) => e.source === "repetibox").length;

  return (
    <EnseignantLayout>
      <div className="page">
        <div className="container" style={{ maxWidth: 680 }}>

          {/* Créer un groupe */}
          <div className="card" style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>➕ Nouveau groupe</h2>
            <form onSubmit={creerGroupe} style={{ display: "flex", gap: 10 }}>
              <input
                ref={inputCreationRef}
                type="text"
                className="form-input"
                value={nomNouveau}
                onChange={(e) => setNomNouveau(e.target.value)}
                placeholder="Ex. CE2, Groupe lecture, CM1-CM2…"
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn-primary" disabled={creationEnCours || !nomNouveau.trim()} style={{ flexShrink: 0 }}>
                Créer
              </button>
            </form>

            {/* Compteur élèves par source */}
            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              {nbPlanBox > 0 && (
                <span style={{ fontSize: 12, color: "var(--primary)", background: "var(--primary-pale)", padding: "3px 10px", borderRadius: 6, fontWeight: 600 }}>
                  📋 {nbPlanBox} élève{nbPlanBox > 1 ? "s" : ""} Plan Box
                </span>
              )}
              {nbRepetibox > 0 && (
                <span style={{ fontSize: 12, color: "#92400E", background: "#FEF3C7", padding: "3px 10px", borderRadius: 6, fontWeight: 600 }}>
                  🃏 {nbRepetibox} élève{nbRepetibox > 1 ? "s" : ""} Repetibox
                </span>
              )}
              {nbPlanBox === 0 && nbRepetibox === 0 && !rbErreur && !chargement && (
                <span className="text-xs text-secondary">Aucun élève trouvé dans les deux apps.</span>
              )}
            </div>

            {/* Diagnostic RLS Repetibox — erreur explicite */}
            {rbErreur && (
              <div style={{ marginTop: 10, padding: "10px 14px", background: "#FEF3C7", borderRadius: 8, border: "1px solid #FCD34D" }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#92400E", marginBottom: 2 }}>⚠️ Impossible de lire les élèves Repetibox</p>
                <p style={{ fontSize: 11, color: "#78350F", fontFamily: "monospace" }}>{rbErreur}</p>
                <p style={{ fontSize: 11, color: "#92400E", marginTop: 4 }}>
                  Exécute <code>supabase/eleve_rls_fix.sql</code> dans l'éditeur SQL Supabase pour corriger les permissions.
                </p>
              </div>
            )}

            {/* Diagnostic RLS — silence (0 lignes sans erreur = politique RLS manquante) */}
            {!rbErreur && nbRepetibox === 0 && !chargement && (
              <div style={{ marginTop: 10, padding: "10px 14px", background: "#F0FDF4", borderRadius: 8, border: "1px solid #BBF7D0" }}>
                <p style={{ fontSize: 11, color: "#166534" }}>
                  🃏 0 élève Repetibox détecté. Si tu as des élèves dans Repetibox, exécute{" "}
                  <code style={{ fontSize: 10 }}>supabase/eleve_rls_fix.sql</code> dans Supabase pour autoriser la lecture.
                </p>
              </div>
            )}
          </div>

          {/* Annuaire de tous les élèves */}
          {!chargement && tousEleves.length > 0 && (
            <div className="card" style={{ marginBottom: 24, padding: 0, overflow: "hidden" }}>
              <button
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "14px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                onClick={() => setAnnuaireOuvert((v) => !v)}
              >
                <span style={{ fontWeight: 700, fontSize: 14 }}>
                  👤 Annuaire des élèves ({tousEleves.length})
                </span>
                <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>{annuaireOuvert ? "▲" : "▼"}</span>
              </button>

              {annuaireOuvert && (
                <div style={{ borderTop: "1px solid var(--border)", padding: "12px 18px" }}>
                  {/* Plan Box */}
                  {tousEleves.filter((e) => e.source === "planbox").length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)", marginBottom: 8 }}>
                        📋 Plan Box ({tousEleves.filter((e) => e.source === "planbox").length})
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {tousEleves.filter((e) => e.source === "planbox").map((e) => (
                          <span key={e.uid} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "var(--primary-pale)", borderRadius: 20, fontSize: 13 }}>
                            <span style={{ fontWeight: 600 }}>{e.prenom} {e.nom}</span>
                            <span style={{ fontSize: 11, color: "var(--primary)", opacity: 0.8 }}>{e.info}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Repetibox */}
                  {tousEleves.filter((e) => e.source === "repetibox").length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E", marginBottom: 8 }}>
                        🃏 Repetibox ({tousEleves.filter((e) => e.source === "repetibox").length})
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {tousEleves.filter((e) => e.source === "repetibox").map((e) => (
                          <span key={e.uid} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "#FEF3C7", borderRadius: 20, fontSize: 13 }}>
                            <span style={{ fontWeight: 600 }}>{e.prenom} {e.nom}</span>
                            {e.info && e.info !== "Repetibox" && (
                              <span style={{ fontSize: 11, color: "#92400E", opacity: 0.8 }}>{e.info}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Liste des groupes */}
          {chargement ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)" }}>Chargement…</div>
          ) : groupes.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "32px 20px", color: "var(--text-secondary)" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
              <p>Aucun groupe pour l'instant.</p>
              <p className="text-sm">Crée un premier groupe ci-dessus.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {groupes.map((groupe) => {
                const ouvert = groupeOuvert === groupe.id;
                const enEdition = groupeEnEdition === groupe.id;
                const horsGroupe = elevesHorsGroupe(groupe);
                const pbHors = horsGroupe.filter((e) => e.source === "planbox");
                const rbHors = horsGroupe.filter((e) => e.source === "repetibox");

                return (
                  <div key={groupe.id} className="card" style={{ padding: 0, overflow: "hidden" }}>

                    {/* En-tête */}
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer", background: ouvert ? "var(--primary-pale)" : "var(--white)", borderBottom: ouvert ? "1px solid var(--primary-mid)" : "none", transition: "background 0.15s ease" }}
                      onClick={() => setGroupeOuvert(ouvert ? null : groupe.id)}
                    >
                      <span style={{ fontSize: 18 }}>👥</span>

                      {enEdition ? (
                        <input
                          type="text"
                          className="form-input"
                          value={nomEdition}
                          onChange={(e) => setNomEdition(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => { if (e.key === "Enter") renommerGroupe(groupe.id); if (e.key === "Escape") setGroupeEnEdition(null); }}
                          autoFocus
                          style={{ flex: 1, fontSize: 15, fontWeight: 600 }}
                        />
                      ) : (
                        <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{groupe.nom}</span>
                      )}

                      <span className="badge badge-primary" style={{ fontSize: 12 }}>
                        {groupe.membres.length} élève{groupe.membres.length !== 1 ? "s" : ""}
                      </span>

                      {enEdition ? (
                        <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                          <button className="btn-primary" onClick={() => renommerGroupe(groupe.id)} style={{ padding: "4px 12px", fontSize: 13 }}>✓</button>
                          <button className="btn-ghost" onClick={() => setGroupeEnEdition(null)} style={{ padding: "4px 10px", fontSize: 13 }}>✕</button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                          <button className="btn-ghost" title="Renommer" onClick={() => { setNomEdition(groupe.nom); setGroupeEnEdition(groupe.id); setGroupeOuvert(groupe.id); }} style={{ padding: "4px 10px", fontSize: 13 }}>✏️</button>
                          {groupeASupprimer === groupe.id ? (
                            <>
                              <button className="btn-ghost" onClick={() => supprimerGroupe(groupe.id)} style={{ padding: "4px 10px", fontSize: 13, color: "var(--error)", borderColor: "var(--error)" }}>Confirmer</button>
                              <button className="btn-ghost" onClick={() => setGroupeASupprimer(null)} style={{ padding: "4px 10px", fontSize: 13 }}>Annuler</button>
                            </>
                          ) : (
                            <button className="btn-ghost" title="Supprimer" onClick={() => setGroupeASupprimer(groupe.id)} style={{ padding: "4px 10px", fontSize: 13, color: "var(--text-secondary)" }}>🗑</button>
                          )}
                        </div>
                      )}

                      <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>{ouvert ? "▲" : "▼"}</span>
                    </div>

                    {/* Corps */}
                    {ouvert && (
                      <div style={{ padding: "16px 18px" }}>

                        {groupe.membres.length === 0 ? (
                          <p className="text-sm text-secondary" style={{ marginBottom: 14 }}>Aucun élève dans ce groupe.</p>
                        ) : (
                          <div style={{ marginBottom: 14 }}>
                            {groupe.membres.map((eleve) => (
                              <div
                                key={eleve.uid}
                                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", marginBottom: 6, background: "var(--bg)", borderRadius: 8, border: "1px solid var(--border)" }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <span style={{ fontSize: 18 }}>👤</span>
                                  <div>
                                    <span style={{ fontSize: 14, fontWeight: 600 }}>{eleve.prenom} {eleve.nom}</span>
                                    <span style={{
                                      marginLeft: 8, fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 5,
                                      background: eleve.source === "planbox" ? "var(--primary-pale)" : "#FEF3C7",
                                      color: eleve.source === "planbox" ? "var(--primary)" : "#92400E",
                                    }}>
                                      {eleve.source === "planbox" ? "📋" : "🃏"} {eleve.info}
                                    </span>
                                  </div>
                                </div>
                                <button className="btn-ghost" onClick={() => retirerMembre(eleve.uid, groupe.id)} title="Retirer du groupe" style={{ padding: "4px 10px", fontSize: 13, color: "var(--text-secondary)" }}>✕</button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Ajouter un élève */}
                        {horsGroupe.length > 0 && (
                          <div style={{ display: "flex", gap: 8 }}>
                            <select
                              className="form-input"
                              value={eleveAAjouter[groupe.id] ?? ""}
                              onChange={(e) => setEleveAAjouter((prev) => ({ ...prev, [groupe.id]: e.target.value }))}
                              style={{ flex: 1, fontSize: 13 }}
                            >
                              <option value="">— Ajouter un élève —</option>
                              {pbHors.length > 0 && (
                                <optgroup label="📋 Plan Box">
                                  {pbHors.map((e) => (
                                    <option key={e.uid} value={e.uid}>{e.prenom} {e.nom} ({e.info})</option>
                                  ))}
                                </optgroup>
                              )}
                              {rbHors.length > 0 && (
                                <optgroup label="🃏 Repetibox">
                                  {rbHors.map((e) => (
                                    <option key={e.uid} value={e.uid}>{e.prenom} {e.nom}</option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                            <button className="btn-primary" onClick={() => ajouterMembre(groupe.id)} disabled={!eleveAAjouter[groupe.id]} style={{ flexShrink: 0, fontSize: 13 }}>
                              Ajouter
                            </button>
                          </div>
                        )}

                        {horsGroupe.length === 0 && groupe.membres.length > 0 && (
                          <p className="text-xs text-secondary">Tous les élèves sont déjà dans ce groupe.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </EnseignantLayout>
  );
}
