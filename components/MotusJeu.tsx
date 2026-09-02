"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EtatPartie, Marque } from "@/lib/motus";

/**
 * Le Motus du jour, jouable tel quel dans une page.
 *
 * Le mot secret reste sur le serveur : chaque proposition part en POST et
 * revient coloriée. Le composant ne fait qu'afficher l'état renvoyé, donc un
 * rechargement de page (ou un autre appareil) retrouve la partie en cours.
 */

const AZERTY: string[][] = [
  ["A", "Z", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["Q", "S", "D", "F", "G", "H", "J", "K", "L", "M"],
  ["ENTREE", "W", "X", "C", "V", "B", "N", "EFFACER"],
];

const COULEUR: Record<Marque, string> = {
  correct: "#5EA45B",
  present: "#E0A72E",
  absent: "#C0473C",
};

/** Meilleure couleur connue pour chaque lettre du clavier. */
function etatClavier(essais: EtatPartie["essais"]): Record<string, Marque> {
  const priorite: Record<Marque, number> = { absent: 0, present: 1, correct: 2 };
  const etat: Record<string, Marque> = {};
  for (const e of essais) {
    e.mot.split("").forEach((lettre, i) => {
      const m = e.marques[i];
      if (!(lettre in etat) || priorite[m] > priorite[etat[lettre]]) etat[lettre] = m;
    });
  }
  return etat;
}

export default function MotusJeu({ onEtat }: { onEtat?: (e: EtatPartie) => void }) {
  const [etat, setEtat] = useState<EtatPartie | null>(null);
  const [aucunMot, setAucunMot] = useState(false);
  const [echec, setEchec] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [saisie, setSaisie] = useState("");
  const [message, setMessage] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const envoiRef = useRef(false);

  const appliquer = useCallback(
    (json: EtatPartie) => {
      setEtat(json);
      setSaisie(json.termine ? "" : json.premiere_lettre);
      onEtat?.(json);
    },
    [onEtat],
  );

  useEffect(() => {
    let annule = false;
    fetch("/api/motus")
      .then((r) => r.json())
      .then((json) => {
        if (annule) return;
        if (json?.aucun_mot) setAucunMot(true);
        else if (json?.longueur) appliquer(json as EtatPartie);
        else setEchec(true);
        setChargement(false);
      })
      .catch(() => {
        if (annule) return;
        setEchec(true);
        setChargement(false);
      });
    return () => {
      annule = true;
    };
  }, [appliquer]);

  const valider = useCallback(async () => {
    if (!etat || etat.termine || envoiRef.current) return;
    if (saisie.length < etat.longueur) {
      setMessage("Complète le mot avant de valider.");
      return;
    }
    envoiRef.current = true;
    setEnvoi(true);
    setMessage("");
    try {
      const res = await fetch("/api/motus/essai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mot: saisie }),
      });
      const json = await res.json();
      if (json?.longueur) appliquer(json as EtatPartie);
      if (json?.erreur) setMessage(json.erreur);
    } catch {
      setMessage("Connexion perdue — réessaie.");
    } finally {
      envoiRef.current = false;
      setEnvoi(false);
    }
  }, [etat, saisie, appliquer]);

  const touche = useCallback(
    (t: string) => {
      if (!etat || etat.termine || envoiRef.current) return;
      if (t === "EFFACER") {
        // La première lettre est donnée : elle ne s'efface pas.
        setSaisie((s) => (s.length > 1 ? s.slice(0, -1) : s));
        setMessage("");
        return;
      }
      if (t === "ENTREE") {
        void valider();
        return;
      }
      setSaisie((s) => (s.length < etat.longueur ? s + t : s));
      setMessage("");
    },
    [etat, valider],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = e.key.toUpperCase();
      if (k === "BACKSPACE") touche("EFFACER");
      else if (k === "ENTER") touche("ENTREE");
      else if (/^[A-ZÀ-Ÿ]$/.test(k)) {
        const norm = k.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (/^[A-Z]$/.test(norm)) touche(norm);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [touche]);

  if (chargement) {
    return <div className="motus-vide">Chargement du mot du jour…</div>;
  }
  if (aucunMot) {
    return (
      <div className="motus-vide">
        Pas de mot aujourd&apos;hui — il n&apos;y en a pas encore dans la liste de la classe.
      </div>
    );
  }
  if (echec || !etat) {
    return (
      <div className="motus-vide">
        Le mot du jour n&apos;a pas pu être chargé. Recharge la page dans un instant.
      </div>
    );
  }

  const clavier = etatClavier(etat.essais);
  const ligneCourante = etat.essais.length;

  return (
    <div className="motus-jeu" style={{ ["--motus-lettres" as string]: etat.longueur }}>
      <div className="motus-compteur">
        {etat.termine
          ? etat.trouve
            ? `Trouvé en ${etat.essais.length} essai${etat.essais.length > 1 ? "s" : ""} !`
            : `Le mot était ${etat.mot}`
          : `Essai ${ligneCourante + 1} sur ${etat.essais_max} — mot de ${etat.longueur} lettres`}
      </div>

      <div className="motus-grille">
        {Array.from({ length: etat.essais_max }).map((_, r) => {
          const essai = etat.essais[r];
          const enCours = !etat.termine && r === ligneCourante;
          return (
            <div className="motus-rangee" key={r}>
              {Array.from({ length: etat.longueur }).map((__, c) => {
                const lettre = essai ? essai.mot[c] : enCours ? saisie[c] ?? "" : "";
                const marque = essai ? essai.marques[c] : null;
                return (
                  <div
                    key={c}
                    className={`motus-case${marque === "absent" ? " absente" : ""}`}
                  >
                    {marque === "correct" || marque === "present" ? (
                      <span className="motus-pastille" style={{ background: COULEUR[marque] }} />
                    ) : null}
                    <span
                      className="motus-lettre"
                      style={marque === "present" ? { color: "#231A00" } : undefined}
                    >
                      {lettre}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="motus-message">
        {message ||
          (etat.termine
            ? etat.trouve
              ? "Bravo ! Rendez-vous demain pour un nouveau mot."
              : "Ce sera pour demain — un nouveau mot chaque jour."
            : "")}
      </div>

      {!etat.termine && (
        <div className="motus-clavier">
          {AZERTY.map((rangee, i) => (
            <div className="motus-rangee-clavier" key={i}>
              {rangee.map((t) => {
                const large = t === "ENTREE" || t === "EFFACER";
                const m = clavier[t];
                return (
                  <button
                    type="button"
                    key={t}
                    onClick={() => touche(t)}
                    disabled={envoi}
                    className={`motus-touche${large ? " large" : ""}`}
                    style={m ? { background: COULEUR[m], color: m === "present" ? "#231A00" : "#fff" } : undefined}
                    aria-label={t === "ENTREE" ? "Valider" : t === "EFFACER" ? "Effacer" : t}
                  >
                    {t === "ENTREE" ? "↵" : t === "EFFACER" ? "⌫" : t}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
