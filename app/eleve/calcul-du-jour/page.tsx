"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEleveSession } from "@/hooks/useEleveSession";

type State = "chargement" | "pas_de_calcul" | "en_cours" | "bravo" | "deuxieme_chance" | "correction";

interface Calcul {
  id: string;
  nombre1: number;
  nombre2: number;
  operation: string;
  reponse: number;
  deja_fait: boolean;
}

// ---- Helpers pour l'affichage de l'operation posee ----

function formatOperateur(op: string): string {
  switch (op) {
    case "addition": case "+": return "+";
    case "soustraction": case "-": return "\u2212";
    case "multiplication": case "*": return "\u00d7";
    case "division": case "/": return "\u00f7";
    default: return op;
  }
}

function padLeft(s: string, len: number): string {
  return s.padStart(len, "\u00a0");
}

function renderOperationPosee(op1: number, op2: number, operateur: string): string[] {
  const s1 = String(op1).replace(".", ",");
  const s2 = String(op2).replace(".", ",");
  const symb = formatOperateur(operateur);
  const maxLen = Math.max(s1.length, s2.length);
  const totalWidth = maxLen + 2;
  const line1 = padLeft(s1, totalWidth);
  const line2 = symb + " " + padLeft(s2, maxLen);
  const separator = "\u2500".repeat(totalWidth);
  return [line1, line2, separator];
}

// ---- Composant opération posée avec retenues / cassage ----

// Convertit un nombre en tableau de chiffres alignés sur la virgule
// Retourne { digits, dotIndex } — digits inclut le point si décimal
function toDigits(n: number): string[] {
  return String(n).split("");
}

// Aligne deux nombres sur la virgule et retourne les tableaux de même longueur
function alignNumbers(a: number, b: number): { d1: string[]; d2: string[]; dotIdx: number } {
  const sa = String(a);
  const sb = String(b);
  const dotA = sa.indexOf(".");
  const dotB = sb.indexOf(".");
  const intA = dotA === -1 ? sa.length : dotA;
  const intB = dotB === -1 ? sb.length : dotB;
  const decA = dotA === -1 ? 0 : sa.length - dotA - 1;
  const decB = dotB === -1 ? 0 : sb.length - dotB - 1;
  const maxInt = Math.max(intA, intB);
  const maxDec = Math.max(decA, decB);

  function padNum(s: string, targetInt: number, targetDec: number): string[] {
    const dot = s.indexOf(".");
    const intPart = dot === -1 ? s : s.slice(0, dot);
    const decPart = dot === -1 ? "" : s.slice(dot + 1);
    const padded = intPart.padStart(targetInt, " ") + (targetDec > 0 ? "." + decPart.padEnd(targetDec, "0") : "");
    return padded.split("");
  }

  return {
    d1: padNum(sa, maxInt, maxDec),
    d2: padNum(sb, maxInt, maxDec),
    dotIdx: maxDec > 0 ? maxInt : -1,
  };
}

interface OperationPosee {
  // Lignes du haut (retenues, nombres, séparateur, résultat)
  type: "addition" | "soustraction" | "multiplication" | "division";
  lignesAvant: { texte: string; style?: "retenue" | "cassage" | "normal" | "resultat" }[];
  resultatLigne: string;
  explication?: string;
  // Pour multiplication : lignes intermédiaires
  lignesIntermediaires?: string[];
}

// Composant visuel addition posée avec retenues
function AdditionPoseeView({ a, b, resultat }: { a: number; b: number; resultat: number }) {
  const font = "'Plus Jakarta Sans', sans-serif";
  const cellW = 28;
  const cellH = 38;
  const sa = String(a).replace(".", ",");
  const sb = String(b).replace(".", ",");
  const sRes = String(resultat).replace(".", ",");

  // Aligner les nombres sur la virgule
  const { d1, d2 } = alignNumbers(a, b);
  const d1v = d1.map(c => c === "." ? "," : c);
  const d2v = d2.map(c => c === "." ? "," : c);

  // Aligner le résultat aussi
  const dotIdx1 = d1v.indexOf(",");
  const intLen = dotIdx1 === -1 ? d1v.filter(c => c !== " ").length : d1v.slice(0, dotIdx1).filter(c => c !== " ").length;
  const decLen = dotIdx1 === -1 ? 0 : d1v.length - dotIdx1 - 1;
  const resIntPart = sRes.indexOf(",") === -1 ? sRes : sRes.slice(0, sRes.indexOf(","));
  const resDecPart = sRes.indexOf(",") === -1 ? "" : sRes.slice(sRes.indexOf(",") + 1);
  const paddedRes = resIntPart.padStart(intLen, " ") + (decLen > 0 ? "," + resDecPart.padEnd(decLen, "0") : "");
  const resChars = paddedRes.split("");

  // Calculer retenues
  const digits1 = d1.filter(c => c !== ".").reverse().map(c => c === " " ? 0 : parseInt(c));
  const digits2 = d2.filter(c => c !== ".").reverse().map(c => c === " " ? 0 : parseInt(c));
  const maxDigits = Math.max(digits1.length, digits2.length);
  let ret = 0;
  const retenues: number[] = [];
  for (let i = 0; i < maxDigits; i++) {
    const somme = (digits1[i] ?? 0) + (digits2[i] ?? 0) + ret;
    retenues.push(ret);
    ret = Math.floor(somme / 10);
  }
  if (ret > 0) retenues.push(ret);

  const totalCols = Math.max(d1v.length, resChars.length) + 2; // +2 pour le signe +

  interface GCell { col: number; text: string; color?: string; small?: boolean }
  interface GLine { cells: GCell[]; isSep?: boolean }
  const lines: GLine[] = [];

  const offset = totalCols - d1v.length;

  // Retenues (petites, collées au-dessus du nombre 1)
  const retCells: GCell[] = [];
  // retenues[i] = retenue entrante pour la position i (de droite)
  // Position dans la grille : pour chaque retenue > 0, la placer au-dessus du chiffre correspondant
  for (let i = 0; i < retenues.length; i++) {
    if (retenues[i] > 0) {
      // Position colonne : trouver la colonne du chiffre à la position i (de droite) dans d1v
      // On ignore les virgules pour le comptage
      let digitCount = 0;
      for (let j = d1v.length - 1; j >= 0; j--) {
        if (d1v[j] === "," || d1v[j] === " ") continue;
        if (digitCount === i) {
          retCells.push({ col: offset + j, text: String(retenues[i]), color: "#DC2626", small: true });
          break;
        }
        digitCount++;
      }
    }
  }
  if (retCells.length > 0) lines.push({ cells: retCells });

  // Ligne 1 : nombre A
  lines.push({ cells: d1v.map((c, i) => ({ col: offset + i, text: c === " " ? "" : c })) });

  // Ligne 2 : + nombre B
  const bOff = totalCols - d2v.length;
  lines.push({ cells: [
    { col: bOff - 2, text: "+" },
    ...d2v.map((c, i) => ({ col: bOff + i, text: c === " " ? "" : c })),
  ] });

  // Séparateur
  lines.push({ cells: [], isSep: true });

  // Résultat
  const resOff = totalCols - resChars.length;
  lines.push({ cells: resChars.map((c, i) => ({ col: resOff + i, text: c === " " ? "" : c, color: "#16A34A" })) });

  // Hauteurs
  const lineIsSmall = lines.map(l => !l.isSep && l.cells.length > 0 && l.cells.every(c => c.small));
  const lineHeights = lines.map((l, i) => l.isSep ? 8 : lineIsSmall[i] ? 16 : cellH);
  const lineTops: number[] = [];
  let cumTop = 0;
  for (const h of lineHeights) { lineTops.push(cumTop); cumTop += h; }
  const totalHeight = cumTop;
  const sepWidth = (Math.max(d1v.length, d2v.length) + 1) * cellW;

  return (
    <div style={{
      position: "relative",
      width: totalCols * cellW,
      minHeight: totalHeight,
      fontFamily: font,
      fontWeight: 700,
    }}>
      {lines.map((line, lineIdx) => {
        if (line.isSep) {
          return (
            <div key={lineIdx} style={{
              position: "absolute",
              top: lineTops[lineIdx] + 3,
              right: 0,
              width: sepWidth,
              height: 2,
              background: "var(--text)",
            }} />
          );
        }
        return line.cells.map((cell, cellIdx) => (
          <div key={`${lineIdx}-${cellIdx}`} style={{
            position: "absolute",
            top: lineTops[lineIdx],
            left: cell.small ? cell.col * cellW + cellW * 0.6 : cell.col * cellW,
            width: cell.text === "," ? cellW * 0.3 : cellW,
            height: lineHeights[lineIdx],
            display: "flex",
            alignItems: cell.small ? "flex-end" : "center",
            justifyContent: cell.small ? "flex-start" : "center",
            fontSize: cell.small ? 13 : 22,
            fontWeight: cell.small ? 800 : 700,
            color: cell.color ?? "var(--text)",
          }}>
            {cell.text}
          </div>
        ));
      })}
    </div>
  );
}

function buildAdditionPosee(a: number, b: number, resultat: number): OperationPosee {
  const { d1, d2 } = alignNumbers(a, b);
  const w = Math.max(d1.length, d2.length);
  const sRes = String(resultat);

  // Calculer les retenues (en ignorant le point)
  const digits1 = d1.filter(c => c !== ".").reverse().map(c => c === " " ? 0 : parseInt(c));
  const digits2 = d2.filter(c => c !== ".").reverse().map(c => c === " " ? 0 : parseInt(c));
  const maxLen = Math.max(digits1.length, digits2.length);
  let retenue = 0;
  const retenues: number[] = [];
  for (let i = 0; i < maxLen; i++) {
    const somme = (digits1[i] ?? 0) + (digits2[i] ?? 0) + retenue;
    retenues.push(retenue);
    retenue = Math.floor(somme / 10);
  }
  if (retenue > 0) retenues.push(retenue);
  const hasRetenues = retenues.some(r => r > 0);

  // Construire les lignes
  const pad = 2; // symbole + espace
  const totalW = Math.max(w, sRes.length) + pad;
  const ligne1 = d1.join("").padStart(totalW);
  const ligne2 = "+" + " " + d2.join("").padStart(totalW - pad);
  const sep = "─".repeat(totalW);

  // Retenues : construire une ligne alignée
  let retenueLigne = "";
  if (hasRetenues) {
    // Insérer les retenues au-dessus, alignées sur les chiffres
    const retArr = [...retenues].reverse();
    // Ajouter des espaces pour aligner + remettre le point
    const hasPoint = d1.includes(".");
    const pointPos = d1.indexOf(".");
    let retStr = "";
    for (let i = 0; i < maxLen; i++) {
      const r = retenues[maxLen - 1 - i];
      retStr += r > 0 ? String(r) : " ";
    }
    if (hasPoint) {
      // Insérer un espace pour le point
      const decLen = d1.length - pointPos - 1;
      const posFromRight = decLen;
      const arr = retStr.split("");
      arr.splice(arr.length - posFromRight, 0, " ");
      retStr = arr.join("");
    }
    if (retenue > 0) retStr = String(retenue) + retStr;
    retenueLigne = retStr.padStart(totalW);
  }

  const lignes: OperationPosee["lignesAvant"] = [];
  if (hasRetenues) lignes.push({ texte: retenueLigne, style: "retenue" });
  lignes.push({ texte: ligne1, style: "normal" });
  lignes.push({ texte: ligne2, style: "normal" });

  return {
    type: "addition",
    lignesAvant: lignes,
    resultatLigne: sRes.padStart(totalW),
  };
}

// Données pour le rendu visuel de la soustraction avec cassage
interface SoustractionCell {
  digit: string;            // chiffre affiché (ou ".")
  barred?: boolean;         // chiffre barré (ancien chiffre avant cassage)
  newDigit?: number;        // nouveau chiffre après cassage (affiché à côté en petit)
  carry?: boolean;          // petite retenue "1" à afficher en haut à gauche
}

interface SoustractionPoseeData {
  topRow: SoustractionCell[];
  bottomRow: SoustractionCell[];
  resultRow: SoustractionCell[];
  hasCassage: boolean;
}

function buildSoustractionData(a: number, b: number, resultat: number): SoustractionPoseeData {
  const { d1, d2 } = alignNumbers(a, b);
  const sRes = String(resultat);

  // Extraire les chiffres (sans le point) pour le calcul
  const chars1 = [...d1]; // inclut potentiellement "." et espaces
  const chars2 = [...d2];

  // Construire les tableaux de chiffres (index = position visuelle)
  // On travaille sur les positions qui sont des chiffres (pas le point)
  const digitPositions: number[] = [];
  for (let i = 0; i < chars1.length; i++) {
    if (chars1[i] !== "." && chars1[i] !== " ") digitPositions.push(i);
    else if (chars1[i] === " ") digitPositions.push(i); // espace = 0 implicite
  }

  // Extraire digits purs pour le calcul
  const getDigit = (arr: string[], pos: number): number => {
    const c = arr[pos];
    if (!c || c === " " || c === ".") return 0;
    return parseInt(c);
  };

  // Simuler le cassage (de droite à gauche, sur les positions chiffres)
  const topDigits = digitPositions.map(p => getDigit(chars1, p));
  const botDigits = digitPositions.map(p => getDigit(chars2, p));
  const modifie = [...topDigits];
  const cassage: boolean[] = new Array(digitPositions.length).fill(false); // a reçu +10
  const emprunt: boolean[] = new Array(digitPositions.length).fill(false); // a perdu 1

  for (let i = digitPositions.length - 1; i >= 0; i--) {
    if (modifie[i] < botDigits[i]) {
      for (let j = i - 1; j >= 0; j--) {
        if (modifie[j] > 0) {
          modifie[j] -= 1;
          emprunt[j] = true;
          for (let k = j + 1; k < i; k++) {
            modifie[k] += 9;
            cassage[k] = true;
            emprunt[k] = true;
          }
          modifie[i] += 10;
          cassage[i] = true;
          break;
        }
      }
    }
  }

  const hasCassage = cassage.some(Boolean);

  // Construire les cellules de la ligne du haut
  const topRow: SoustractionCell[] = [];
  let digitIdx = 0;
  for (let i = 0; i < chars1.length; i++) {
    if (chars1[i] === ".") {
      topRow.push({ digit: "," });
    } else {
      const origDigit = topDigits[digitIdx];
      const pos = digitIdx;
      if (emprunt[pos] || cassage[pos]) {
        topRow.push({
          digit: String(origDigit),
          barred: emprunt[pos],
          newDigit: emprunt[pos] ? modifie[pos] : undefined,
          carry: cassage[pos],
        });
      } else {
        topRow.push({ digit: chars1[i] === " " ? "" : String(origDigit) });
      }
      digitIdx++;
    }
  }

  // Ligne du bas
  const bottomRow: SoustractionCell[] = [];
  for (let i = 0; i < chars2.length; i++) {
    if (chars2[i] === ".") {
      bottomRow.push({ digit: "," });
    } else {
      bottomRow.push({ digit: chars2[i] === " " ? "" : chars2[i] });
    }
  }

  // Ligne résultat — aligner sur la virgule comme les autres
  // Recalculer l'alignement en incluant le résultat
  const sResStr = String(resultat);
  const dotRes = sResStr.indexOf(".");
  const intRes = dotRes === -1 ? sResStr.length : dotRes;
  const decRes = dotRes === -1 ? 0 : sResStr.length - dotRes - 1;

  // Calculer les dimensions d'alignement depuis chars1 (qui est déjà aligné)
  const dotPos1 = chars1.indexOf(".");
  const intLen = dotPos1 === -1 ? chars1.filter(c => c !== " ").length : chars1.slice(0, dotPos1).filter(c => c !== " ").length;
  const decLen = dotPos1 === -1 ? 0 : chars1.length - dotPos1 - 1;

  // Pad le résultat pour l'aligner
  const resIntPart = dotRes === -1 ? sResStr : sResStr.slice(0, dotRes);
  const resDecPart = dotRes === -1 ? "" : sResStr.slice(dotRes + 1);
  const paddedRes = resIntPart.padStart(intLen, " ") + (decLen > 0 ? "," + resDecPart.padEnd(decLen, "0") : "");
  const resChars = paddedRes.split("");

  const resultRow: SoustractionCell[] = [];
  for (const c of resChars) {
    if (c === ",") {
      resultRow.push({ digit: "," });
    } else {
      resultRow.push({ digit: c === " " ? "" : c });
    }
  }

  return { topRow, bottomRow, resultRow, hasCassage };
}

// Composant React pour rendre une cellule de soustraction
function SoustractionCellView({ cell, size }: { cell: SoustractionCell; size: number }) {
  const font = "'Plus Jakarta Sans', sans-serif";
  if (cell.digit === "," || cell.digit === ".") {
    return (
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", width: size * 0.3, fontSize: size, fontWeight: 700, fontFamily: font }}>
        ,
      </div>
    );
  }
  return (
    <div style={{
      position: "relative",
      width: size,
      height: size * 1.4,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: font,
    }}>
      {/* Nouveau chiffre après cassage (en petit devant, en haut à gauche) */}
      {cell.newDigit !== undefined && (
        <span style={{
          position: "absolute",
          top: 2,
          left: -2,
          fontSize: size * 0.38,
          fontWeight: 800,
          color: "#DC2626",
        }}>
          {cell.newDigit}
        </span>
      )}
      {/* "1" de retenue (devant le chiffre, aligné verticalement) */}
      {cell.carry && !cell.barred && (
        <span style={{
          position: "absolute",
          top: "50%",
          left: -4,
          transform: "translateY(-50%)",
          fontSize: size * 0.55,
          fontWeight: 800,
          color: "#DC2626",
        }}>
          1
        </span>
      )}
      {/* Chiffre principal */}
      <span style={{
        fontSize: size,
        fontWeight: 700,
        color: "var(--text)",
        textDecoration: cell.barred ? "line-through" : "none",
        textDecorationColor: cell.barred ? "#DC2626" : undefined,
        textDecorationThickness: cell.barred ? "2.5px" : undefined,
        opacity: cell.barred ? 0.45 : 1,
      }}>
        {cell.digit}
      </span>
    </div>
  );
}

function buildMultiplicationPosee(a: number, b: number, resultat: number): OperationPosee {
  // Placeholder — on utilise le composant visuel MultiplicationPoseeView
  return { type: "multiplication", lignesAvant: [], resultatLigne: String(resultat) };
}

// Données pour la multiplication posée avec retenues
interface MultLignePartielle {
  chiffreB: number;     // chiffre du multiplicateur
  rang: number;         // 0 = unités, 1 = dizaines, etc.
  produit: number;      // produit partiel (sans décalage)
  retenues: number[];   // retenues pour chaque colonne (de droite à gauche)
  chiffresResultat: number[]; // chiffres du résultat partiel (de droite à gauche)
}

function buildMultiplicationData(a: number, b: number): {
  digitsA: number[];
  digitsB: number[];
  partiels: MultLignePartielle[];
  resultat: number;
} {
  const digitsA = String(a).split("").map(Number);
  const digitsB = String(b).split("").map(Number).reverse(); // unités d'abord
  const partiels: MultLignePartielle[] = [];

  for (let rang = 0; rang < digitsB.length; rang++) {
    const chiffreB = digitsB[rang];
    const retenues: number[] = [];
    const chiffresResultat: number[] = [];
    let retenue = 0;

    for (let j = digitsA.length - 1; j >= 0; j--) {
      const prod = digitsA[j] * chiffreB + retenue;
      chiffresResultat.push(prod % 10);
      retenue = Math.floor(prod / 10);
      retenues.push(retenue);
    }
    if (retenue > 0) {
      chiffresResultat.push(retenue);
      retenues.push(0);
    }

    partiels.push({
      chiffreB,
      rang,
      produit: a * chiffreB,
      retenues, // retenues[0] = retenue après unités, etc.
      chiffresResultat, // chiffresResultat[0] = unité du résultat, etc.
    });
  }

  return { digitsA, digitsB, partiels, resultat: a * b };
}

// Composant visuel multiplication posée
function MultiplicationPoseeView({ a, b, resultat }: { a: number; b: number; resultat: number }) {
  const data = buildMultiplicationData(a, b);
  const font = "'Plus Jakarta Sans', sans-serif";
  const cellW = 28;
  const cellH = 38;
  const sa = String(a);
  const sb = String(b);
  const sRes = String(resultat);

  // Largeur max = max(len(a), len(résultat), len de chaque produit partiel + rang)
  const maxCols = Math.max(
    sa.length,
    sRes.length,
    ...data.partiels.map(p => p.chiffresResultat.length + p.rang),
  );
  // +2 pour le signe ×
  const totalCols = maxCols + 2;

  interface GCell { col: number; text: string; color?: string; small?: boolean; carry?: number }
  interface GLine { cells: GCell[]; isSep?: boolean }
  const lines: GLine[] = [];

  // Ligne 1 : nombre A (aligné à droite)
  const aOffset = totalCols - sa.length;
  lines.push({ cells: sa.split("").map((c, i) => ({ col: aOffset + i, text: c })) });

  // Ligne 2 : × nombre B
  const bOffset = totalCols - sb.length;
  lines.push({ cells: [
    { col: bOffset - 2, text: "×" },
    ...sb.split("").map((c, i) => ({ col: bOffset + i, text: c })),
  ] });

  // Séparateur
  lines.push({ cells: [], isSep: true });

  // Produits partiels (sans retenues de multiplication)
  const partielValues: number[] = [];
  for (let p = 0; p < data.partiels.length; p++) {
    const part = data.partiels[p];
    const chiffres = [...part.chiffresResultat].reverse();
    const prodStr = chiffres.join("");
    const fullProd = part.produit * Math.pow(10, part.rang);
    partielValues.push(fullProd);
    const prodOffset = totalCols - prodStr.length - part.rang;

    const prodCells: GCell[] = [];
    if (p === data.partiels.length - 1 && data.partiels.length > 1) {
      prodCells.push({ col: prodOffset - 2, text: "+" });
    }
    for (let j = 0; j < prodStr.length; j++) {
      prodCells.push({ col: prodOffset + j, text: prodStr[j] });
    }
    for (let z = 0; z < part.rang; z++) {
      prodCells.push({ col: totalCols - 1 - z, text: "0", color: "var(--text-secondary)" });
    }
    lines.push({ cells: prodCells });
  }

  // Retenues de l'addition au-dessus du premier produit partiel
  if (data.partiels.length > 1) {
    const addRetenues: number[] = [];
    let carry = 0;
    for (let col = 0; col < sRes.length; col++) {
      let sum = carry;
      for (const pv of partielValues) {
        const s = String(pv).padStart(sRes.length, "0");
        sum += parseInt(s[sRes.length - 1 - col]);
      }
      addRetenues.push(carry);
      carry = Math.floor(sum / 10);
    }

    // Insérer les retenues juste AVANT le premier produit partiel (ligne index 3, après séparateur)
    const retCells: GCell[] = [];
    const resOffset2 = totalCols - sRes.length;
    for (let col = 0; col < addRetenues.length; col++) {
      if (addRetenues[col] > 0) {
        retCells.push({
          col: resOffset2 + (sRes.length - 1 - col),
          text: String(addRetenues[col]),
          color: "#DC2626",
          small: true,
        });
      }
    }
    if (retCells.length > 0) {
      // Insérer à la position 3 (après: multiplicande, multiplicateur, séparateur)
      lines.splice(3, 0, { cells: retCells });
    }

    // Séparateur avant résultat
    lines.push({ cells: [], isSep: true });
  }

  // Résultat final
  const resOffset = totalCols - sRes.length;
  lines.push({ cells: sRes.split("").map((c, i) => ({ col: resOffset + i, text: c, color: "#16A34A" })) });

  // Calculer les positions Y cumulées (les lignes small = 16px, normales = cellH, sep = 8px)
  const lineIsSmall = lines.map(l => !l.isSep && l.cells.length > 0 && l.cells.every(c => c.small));
  const lineHeights = lines.map((l, i) => l.isSep ? 8 : lineIsSmall[i] ? 16 : cellH);
  const lineTops: number[] = [];
  let cumTop = 0;
  for (const h of lineHeights) { lineTops.push(cumTop); cumTop += h; }
  const totalHeight = cumTop;
  const sepWidth = (maxCols + 1) * cellW;

  return (
    <div style={{
      position: "relative",
      width: totalCols * cellW,
      minHeight: totalHeight,
      fontFamily: font,
      fontWeight: 700,
    }}>
      {lines.map((line, lineIdx) => {
        if (line.isSep) {
          return (
            <div key={lineIdx} style={{
              position: "absolute",
              top: lineTops[lineIdx] + 3,
              right: 0,
              width: sepWidth,
              height: 2,
              background: "var(--text)",
            }} />
          );
        }
        return line.cells.map((cell, cellIdx) => (
          <div key={`${lineIdx}-${cellIdx}`} style={{
            position: "absolute",
            top: lineTops[lineIdx],
            left: cell.small ? cell.col * cellW + cellW * 0.6 : cell.col * cellW,
            width: cellW,
            height: lineHeights[lineIdx],
            display: "flex",
            alignItems: cell.small ? "flex-end" : "center",
            justifyContent: cell.small ? "flex-start" : "center",
            fontSize: cell.small ? 13 : 22,
            fontWeight: cell.small ? 800 : 700,
            color: cell.color ?? "var(--text)",
          }}>
            {cell.text}
          </div>
        ));
      })}
    </div>
  );
}

function buildDivisionPosee(a: number, b: number, resultat: number): OperationPosee {
  // Placeholder - on utilise le composant visuel DivisionPotence
  return {
    type: "division",
    lignesAvant: [],
    resultatLigne: String(resultat),
  };
}

// Données pour la division en potence
interface DivisionEtape {
  partiel: number;      // nombre partiel qu'on divise
  produit: number;      // diviseur × quotient partiel
  reste: number;        // partiel - produit
  quotientChiffre: number; // chiffre du quotient
  descendu?: number;    // chiffre descendu (undefined pour la première étape)
}

function buildDivisionData(a: number, b: number): {
  dividende: number;
  diviseur: number;
  quotient: number;
  reste: number;
  etapes: DivisionEtape[];
} {
  const quotient = Math.floor(a / b);
  const reste = a - quotient * b;
  const sa = String(a);
  const etapes: DivisionEtape[] = [];
  let partiel = 0;
  let firstStep = true;

  for (let i = 0; i < sa.length; i++) {
    const descendu = parseInt(sa[i]);
    partiel = partiel * 10 + descendu;
    if (firstStep && partiel < b) continue;
    const q = Math.floor(partiel / b);
    const produit = q * b;
    const newReste = partiel - produit;
    etapes.push({
      partiel,
      produit,
      reste: newReste,
      quotientChiffre: q,
      descendu: firstStep ? undefined : descendu,
    });
    partiel = newReste;
    firstStep = false;
  }

  return { dividende: a, diviseur: b, quotient, reste, etapes };
}

// Composant React pour la potence (version simple = sans étapes, pour l'affichage avant réponse)
function DivisionPotenceSimple({ a, b }: { a: number; b: number }) {
  const font = "'Plus Jakarta Sans', sans-serif";
  const sz = 28;
  return (
    <div style={{ display: "inline-flex", fontFamily: font, fontSize: sz, fontWeight: 700, alignItems: "flex-start" }}>
      <div style={{ lineHeight: 1.6, color: "var(--text)", whiteSpace: "pre" }}>
        {String(a).replace(".", ",")}
      </div>
      <div style={{
        borderLeft: "3px solid var(--text)",
        marginLeft: 12,
        paddingLeft: 12,
        display: "flex",
        flexDirection: "column",
      }}>
        <div style={{ lineHeight: 1.6, color: "var(--text)" }}>
          {String(b).replace(".", ",")}
        </div>
        <div style={{ borderBottom: "3px solid var(--text)", marginBottom: 4 }} />
        <div style={{ lineHeight: 1.6, color: "var(--text-secondary)", fontSize: sz * 0.7 }}>
          ?
        </div>
      </div>
    </div>
  );
}

// Composant React pour la division en potence (version complète avec étapes)
// Format école française : résultat de la soustraction avec zéros, chiffre abaissé qui glisse à côté
function DivisionPotence({ a, b }: { a: number; b: number }) {
  const data = buildDivisionData(a, b);
  const font = "'Plus Jakarta Sans', sans-serif";
  const cellW = 28;
  const cellH = 36;
  const sa = String(a);
  const divLen = sa.length;

  interface GridCell { col: number; text: string; color?: string }
  interface GridLine {
    cells: GridCell[];
    isSep?: { fromCol: number; toCol: number };
  }

  const gridLines: GridLine[] = [];

  // Ligne 1 : dividende
  gridLines.push({ cells: sa.split("").map((c, i) => ({ col: i, text: c, color: "var(--text)" })) });

  // Construire les étapes une par une
  const digits = sa.split("").map(Number);

  // Trouver le premier partiel (prendre assez de chiffres pour >= b)
  let partiel = 0;
  let endCol = -1;
  for (endCol = 0; endCol < digits.length; endCol++) {
    partiel = partiel * 10 + digits[endCol];
    if (partiel >= b) break;
  }

  // Boucle : tant qu'on a un partiel à diviser
  let safetyCount = 0;
  while (safetyCount++ < 20) {
    const q = Math.floor(partiel / b);
    const produit = q * b;
    const reste = partiel - produit;
    const partielLen = String(partiel).length;
    const startCol = endCol - partielLen + 1;

    // Afficher −produit aligné sur le partiel courant
    const prodStr = String(produit).padStart(partielLen, " ");
    const prodCells: GridCell[] = [];
    let firstCell = true;
    for (let j = 0; j < prodStr.length; j++) {
      if (prodStr[j] !== " ") {
        prodCells.push({
          col: startCol + j,
          text: firstCell ? "−" + prodStr[j] : prodStr[j],
          color: "#DC2626",
        });
        firstCell = false;
      }
    }
    if (prodCells.length === 0) {
      prodCells.push({ col: endCol, text: "−0", color: "#DC2626" });
    }
    gridLines.push({ cells: prodCells });

    // Séparateur
    gridLines.push({ cells: [], isSep: { fromCol: startCol, toCol: endCol } });

    // Résultat + abaissement
    const nextDigitIdx = endCol + 1;
    if (nextDigitIdx < digits.length) {
      // Résultat de la soustraction (largeur = celle du partiel)
      const resteStr = String(reste).padStart(partielLen, "0");
      // Ajouter le chiffre abaissé
      const displayStr = resteStr + String(digits[nextDigitIdx]);
      const displayStartCol = endCol - partielLen + 1;
      const displayCells: GridCell[] = [];
      for (let j = 0; j < displayStr.length; j++) {
        displayCells.push({ col: displayStartCol + j, text: displayStr[j], color: "var(--text)" });
      }
      gridLines.push({ cells: displayCells });

      // Prochaine itération : le nouveau partiel est la VALEUR numérique
      partiel = reste * 10 + digits[nextDigitIdx];
      endCol = nextDigitIdx;
    } else {
      // Reste final
      const resteStr = String(reste).padStart(partielLen, "0");
      const displayCells: GridCell[] = [];
      for (let j = 0; j < resteStr.length; j++) {
        displayCells.push({ col: startCol + j, text: resteStr[j], color: "var(--text)" });
      }
      gridLines.push({ cells: displayCells });
      break;
    }
  }

  // Si on n'a jamais pu diviser au-delà du premier partiel, afficher le reste final
  // (Normalement géré par la boucle ci-dessus)

  const totalHeight = gridLines.length * cellH;

  return (
    <div style={{ display: "inline-flex", fontFamily: font, fontWeight: 700, alignItems: "stretch" }}>
      <div style={{ position: "relative", width: divLen * cellW + cellW * 0.5, minHeight: totalHeight }}>
        {gridLines.map((line, lineIdx) => {
          if (line.isSep) {
            return (
              <div key={lineIdx} style={{
                position: "absolute",
                top: lineIdx * cellH + cellH * 0.4,
                left: line.isSep.fromCol * cellW - 4,
                width: (line.isSep.toCol - line.isSep.fromCol + 1) * cellW + 8,
                height: 2,
                background: "var(--text)",
              }} />
            );
          }
          return line.cells.map((cell, cellIdx) => (
            <div key={`${lineIdx}-${cellIdx}`} style={{
              position: "absolute",
              top: lineIdx * cellH,
              left: cell.col * cellW,
              width: cellW,
              height: cellH,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 700,
              color: cell.color ?? "var(--text)",
            }}>
              {cell.text}
            </div>
          ));
        })}
      </div>

      <div style={{
        borderLeft: "3px solid var(--text)",
        paddingLeft: 10,
        display: "flex",
        flexDirection: "column",
        minHeight: totalHeight,
      }}>
        <div style={{ fontSize: 22, lineHeight: `${cellH}px`, color: "var(--text)" }}>
          {String(data.diviseur).replace(".", ",")}
        </div>
        <div style={{ borderBottom: "3px solid var(--text)", marginBottom: 4 }} />
        <div style={{ fontSize: 22, lineHeight: `${cellH}px`, color: "#16A34A", fontWeight: 800 }}>
          {String(data.quotient).replace(".", ",")}
        </div>
      </div>
    </div>
  );
}

// ---- Composant principal ----

export default function CalculDuJourPage() {
  const router = useRouter();
  const { session, chargement: chargementSession } = useEleveSession();

  const [state, setState] = useState<State>("chargement");
  const [calcul, setCalcul] = useState<Calcul | null>(null);
  const [reponse, setReponse] = useState("");
  const [tentative, setTentative] = useState(0);
  const [startTime] = useState(() => Date.now());

  const THEME_COLOR = "#7C3AED";

  useEffect(() => {
    if (chargementSession) return;
    if (!session) { router.push("/eleve"); return; }

    fetch("/api/calcul-du-jour")
      .then((r) => r.json())
      .then((data) => {
        if (data.error || data.inactif) {
          setState("pas_de_calcul");
          return;
        }
        if (data.deja_fait && data.correct) {
          // Deja fait et reussi : montrer bravo avec les infos du calcul
          setCalcul({
            id: "",
            nombre1: data.nombre1,
            nombre2: data.nombre2,
            operation: data.operation,
            reponse: data.reponse,
            deja_fait: true,
          });
          setState("bravo");
          return;
        }
        if (!data.id) {
          setState("pas_de_calcul");
          return;
        }
        setCalcul({ ...data, reponse: data.reponse ?? 0 });
        if (data.tentatives_restantes === 0) {
          setState("correction");
        } else {
          setState("en_cours");
        }
      })
      .catch(() => setState("pas_de_calcul"));
  }, [chargementSession, session, router]);

  const verifier = useCallback(async () => {
    if (!calcul || !reponse.trim()) return;

    const res = await fetch("/api/calcul-du-jour/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calcul_id: calcul.id, reponse_eleve: parseFloat(reponse.replace(",", ".")), temps_reponse: Math.round((Date.now() - startTime) / 1000) }),
    });
    const data = await res.json();

    if (data.correct) {
      setState("bravo");
    } else if (data.correction) {
      // Max tentatives atteint, on a la correction
      setCalcul((prev) => prev ? { ...prev, reponse: data.correction.reponse } : prev);
      setTentative(2);
      setState("correction");
    } else {
      setTentative(1);
      setState("deuxieme_chance");
    }
    setReponse("");
  }, [calcul, reponse, tentative]);

  // ---- Ecran de chargement ----
  if (chargementSession || state === "chargement") {
    return (
      <div className="eleve-page" style={{ background: "#f8f5ff" }}>
        <nav style={{
          position: "sticky", top: 0, zIndex: 50,
          background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 20px",
        }}>
          <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 17, color: "var(--pb-on-surface)" }}>
            Calcul du Jour
          </span>
        </nav>
        <main style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1.5rem" }}>
          <div className="skeleton" style={{ height: 200, borderRadius: 16, marginBottom: 24 }} />
          <div className="skeleton" style={{ height: 120, borderRadius: 16 }} />
        </main>
      </div>
    );
  }

  // ---- Pas de calcul ----
  if (state === "pas_de_calcul" || !calcul) {
    return (
      <div className="eleve-page" style={{ background: "#f8f5ff" }}>
        <nav style={{
          position: "sticky", top: 0, zIndex: 50,
          background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 20px",
        }}>
          <Link href="/eleve/dashboard" style={{
            display: "flex", alignItems: "center", gap: 6,
            color: THEME_COLOR, fontWeight: 600, fontSize: 14,
            textDecoration: "none", padding: "6px 10px", borderRadius: 12,
          }}>
            <span className="ms" style={{ fontSize: 20 }}>arrow_back</span>
            Retour
          </Link>
          <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 17, color: "var(--pb-on-surface)" }}>
            Calcul du Jour
          </span>
          <div style={{ width: 60 }} />
        </nav>
        <main style={{ maxWidth: 640, margin: "0 auto", padding: "4rem 1.5rem", textAlign: "center" }}>
          <span className="ms" style={{ fontSize: 56, color: "var(--pb-outline-variant)", display: "block", marginBottom: 16 }}>event_busy</span>
          <p style={{ fontSize: 18, fontWeight: 600, color: "var(--pb-on-surface-variant)" }}>
            Pas de calcul aujourd&apos;hui
          </p>
          <Link href="/eleve/dashboard" style={{
            color: THEME_COLOR, marginTop: 20, display: "inline-block",
            fontSize: 15, fontWeight: 600, textDecoration: "none",
          }}>
            \u2190 Retour au tableau de bord
          </Link>
        </main>
      </div>
    );
  }

  const operationLines = renderOperationPosee(calcul.nombre1, calcul.nombre2, calcul.operation);

  // ---- Ecran Bravo (deja fait ou bonne reponse) ----
  if (state === "bravo") {
    return (
      <div className="eleve-page" style={{ background: "#f0fdf4", minHeight: "100vh" }}>
        <nav style={{
          position: "sticky", top: 0, zIndex: 50,
          background: "rgba(240,253,244,0.9)", backdropFilter: "blur(12px)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 20px",
        }}>
          <Link href="/eleve/dashboard" style={{
            display: "flex", alignItems: "center", gap: 6,
            color: "#16A34A", fontWeight: 600, fontSize: 14,
            textDecoration: "none", padding: "6px 10px", borderRadius: 12,
          }}>
            <span className="ms" style={{ fontSize: 20 }}>arrow_back</span>
            Retour
          </Link>
          <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 17, color: "#14532d" }}>
            Calcul du Jour
          </span>
          <div style={{ width: 60 }} />
        </nav>

        <main style={{ maxWidth: 640, margin: "0 auto", padding: "3rem 1.5rem", textAlign: "center" }}>
          <div style={{ fontSize: 72, marginBottom: 16 }}>
            \ud83c\udf89
          </div>
          <h1 style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: "clamp(1.75rem, 5vw, 2.5rem)",
            fontWeight: 800,
            color: "#16A34A",
            marginBottom: 12,
          }}>
            Bravo !
          </h1>
          <p style={{ fontSize: 18, fontWeight: 600, color: "#15803d", marginBottom: 8 }}>
            C&apos;est la bonne réponse !
          </p>

          {/* Montrer l'operation */}
          <div style={{
            background: "white",
            borderRadius: 16,
            padding: "24px",
            margin: "32px auto",
            maxWidth: 300,
            boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
          }}>
            <pre style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
              fontSize: 28,
              fontWeight: 700,
              lineHeight: 1.6,
              textAlign: "right",
              margin: 0,
              color: "#14532d",
            }}>
              {operationLines.join("\n")}
            </pre>
            <div style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 28,
              fontWeight: 700,
              textAlign: "right",
              color: "#16A34A",
              marginTop: 4,
            }}>
              {String(calcul.reponse).replace(".", ",")}
            </div>
          </div>

          <Link href="/eleve/dashboard" style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "16px 32px", fontSize: 16, borderRadius: 999,
            textDecoration: "none",
            background: "#16A34A", color: "white",
            fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif",
            boxShadow: "0 4px 16px rgba(22,163,74,0.3)",
          }}>
            <span className="ms" style={{ fontSize: 18 }}>home</span>
            Retour au tableau de bord
          </Link>
        </main>
      </div>
    );
  }

  // ---- Ecran de correction ----
  if (state === "correction") {
    const op = calcul.operation;
    const isSoustraction = op === "soustraction" || op === "-";
    const isDivision = op === "division" || op === "/";
    const isMultiplication = op === "multiplication" || op === "*";
    const soustData = isSoustraction ? buildSoustractionData(calcul.nombre1, calcul.nombre2, calcul.reponse) : null;
    const cellSize = 36; // taille d'une cellule en px

    const isAddition = op === "addition" || op === "+";
    const posee: OperationPosee = { type: "addition", lignesAvant: [], resultatLigne: String(calcul.reponse) };

    const monoStyle: React.CSSProperties = {
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      fontSize: "clamp(22px, 5.5vw, 30px)",
      fontWeight: 700,
      lineHeight: 1.7,
      whiteSpace: "pre",
      margin: 0,
    };

    return (
      <div className="eleve-page" style={{ background: "#fef2f2", minHeight: "100vh" }}>
        <nav style={{
          position: "sticky", top: 0, zIndex: 50,
          background: "rgba(254,242,242,0.9)", backdropFilter: "blur(12px)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 20px",
        }}>
          <Link href="/eleve/dashboard" style={{
            display: "flex", alignItems: "center", gap: 6,
            color: "#DC2626", fontWeight: 600, fontSize: 14,
            textDecoration: "none", padding: "6px 10px", borderRadius: 12,
          }}>
            <span className="ms" style={{ fontSize: 20 }}>arrow_back</span>
            Retour
          </Link>
          <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 17, color: "#7f1d1d" }}>
            Correction
          </span>
          <div style={{ width: 60 }} />
        </nav>

        <main style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1.5rem 6rem" }}>

          <header style={{ textAlign: "center", marginBottom: 32 }}>
            <span className="ms" style={{ fontSize: 48, color: "#DC2626", display: "block", marginBottom: 8 }}>school</span>
            <h1 style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: "clamp(1.5rem, 5vw, 2rem)",
              fontWeight: 800,
              color: "#7f1d1d",
              marginBottom: 8,
            }}>
              Voici la correction
            </h1>
            <p style={{ fontSize: 14, color: "#991b1b", fontWeight: 500 }}>
              Regarde bien l&apos;opération posée !
            </p>
          </header>

          {/* Opération posée complète avec retenues/cassage */}
          <div style={{
            background: "white",
            borderRadius: 16,
            padding: "28px",
            marginBottom: 24,
            boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
            borderLeft: `6px solid ${THEME_COLOR}`,
            overflowX: "auto",
          }}>
            <div style={{
              fontSize: 12, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.1em", color: THEME_COLOR,
              marginBottom: 16,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span className="ms" style={{ fontSize: 18 }}>edit</span>
              Opération posée
            </div>

            {/* Rendu visuel pour l'addition posée */}
            {isAddition ? (
              <div style={{ padding: "20px 16px", background: "#fafafa", borderRadius: 12, display: "flex", justifyContent: "center" }}>
                <AdditionPoseeView a={calcul.nombre1} b={calcul.nombre2} resultat={calcul.reponse} />
              </div>
            ) : /* Rendu visuel pour la multiplication posée + retenues */
            isMultiplication ? (
              <div style={{ padding: "20px 16px", background: "#fafafa", borderRadius: 12, display: "flex", justifyContent: "center", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
                <MultiplicationPoseeView a={calcul.nombre1} b={calcul.nombre2} resultat={calcul.reponse} />
                {/* Grille retenues en haut à droite */}
                {(() => {
                  const digitsA = String(calcul.nombre1).split("").map(Number);
                  const digitsB = String(calcul.nombre2).split("").reverse().map(Number);
                  // Pour chaque chiffre de B, calculer les retenues
                  const cols: number[][] = [];
                  for (const cb of digitsB) {
                    const rets: number[] = [];
                    let ret = 0;
                    for (let j = digitsA.length - 1; j >= 0; j--) {
                      const prod = digitsA[j] * cb + ret;
                      ret = Math.floor(prod / 10);
                      rets.push(ret);
                    }
                    cols.push(rets);
                  }
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, alignSelf: "flex-start", marginTop: 4 }}>
                      {cols[0].map((_, rowIdx) => (
                        <div key={rowIdx} style={{ display: "flex", gap: 10 }}>
                          {cols.map((col, colIdx) => (
                            <span key={colIdx} style={{
                              fontSize: 16, fontWeight: 600,
                              fontFamily: "'Plus Jakarta Sans', sans-serif",
                              color: col[rowIdx] > 0 ? "var(--text-secondary)" : "#E5E7EB",
                              width: 20, textAlign: "center",
                            }}>
                              {col[rowIdx]}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ) : /* Rendu visuel pour la division en potence + table */
            isDivision ? (
              <div style={{ padding: "20px 16px", background: "#fafafa", borderRadius: 12, display: "flex", justifyContent: "center", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
                <DivisionPotence a={calcul.nombre1} b={calcul.nombre2} />
                {/* Table du diviseur ×1 à ×10 */}
                <div style={{
                  background: "white",
                  borderRadius: 12,
                  padding: "14px 18px",
                  border: `2px solid ${THEME_COLOR}22`,
                  minWidth: 140,
                }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: "0.08em", color: THEME_COLOR, marginBottom: 10,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}>
                    Table de {calcul.nombre2}
                  </div>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <div key={n} style={{
                      fontSize: 14,
                      fontWeight: 600,
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      color: "var(--text)",
                      lineHeight: 1.8,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                    }}>
                      <span style={{ color: "var(--text-secondary)" }}>{calcul.nombre2} × {n}</span>
                      <span style={{ fontWeight: 700 }}>= {calcul.nombre2 * n}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : /* Rendu visuel pour la soustraction avec cassage */
            isSoustraction && soustData ? (
              <div style={{ padding: "16px 12px", background: "#fafafa", borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center" }}>
                {/* Ligne du haut (nombre1 avec cassage) */}
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-end", gap: 2, marginBottom: 4 }}>
                  {/* Espace pour le signe − */}
                  <div style={{ width: cellSize + 8 }} />
                  {soustData.topRow.map((cell, i) => (
                    <SoustractionCellView key={`top-${i}`} cell={cell} size={cellSize} />
                  ))}
                </div>

                {/* Ligne du bas (− nombre2) */}
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 2 }}>
                  <div style={{
                    width: cellSize + 8,
                    fontSize: cellSize,
                    fontWeight: 700,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    textAlign: "center",
                    color: "var(--text)",
                  }}>
                    −
                  </div>
                  {soustData.bottomRow.map((cell, i) => (
                    <div key={`bot-${i}`} style={{
                      width: (cell.digit === "." || cell.digit === ",") ? cellSize * 0.3 : cellSize,
                      height: cellSize * 1.4,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: cellSize,
                      fontWeight: 700,
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      color: "var(--text)",
                    }}>
                      {cell.digit}
                    </div>
                  ))}
                </div>

                {/* Séparateur */}
                <div style={{
                  height: 3,
                  background: "var(--text)",
                  margin: "6px 0",
                  borderRadius: 2,
                  width: (soustData.topRow.length * (cellSize + 2)) + cellSize + 8,
                }} />

                {/* Ligne résultat */}
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 2 }}>
                  <div style={{ width: cellSize + 8 }} />
                  {soustData.resultRow.map((cell, i) => (
                    <div key={`res-${i}`} style={{
                      width: (cell.digit === "." || cell.digit === ",") ? cellSize * 0.3 : cellSize,
                      height: cellSize * 1.4,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: cellSize,
                      fontWeight: 800,
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      color: "#16A34A",
                    }}>
                      {cell.digit}
                    </div>
                  ))}
                </div>

                {soustData.hasCassage && (
                  <div style={{
                    marginTop: 16, padding: "10px 14px",
                    background: "rgba(220, 38, 38, 0.05)", borderRadius: 10,
                    fontSize: 13, color: "#991B1B", fontWeight: 500,
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <span className="ms" style={{ fontSize: 18 }}>info</span>
                    Méthode de cassage : quand le chiffre du haut est plus petit, on emprunte une dizaine au voisin.
                  </div>
                )}
              </div>
            ) : (
              /* Rendu texte pour addition, multiplication, division */
              <div style={{ padding: "8px 12px", background: "#fafafa", borderRadius: 12, textAlign: "right", display: "flex", flexDirection: "column", alignItems: "center" }}>
                {posee.lignesAvant.map((l, i) => (
                  <pre key={`av-${i}`} style={{
                    ...monoStyle,
                    color: l.style === "retenue" ? "#DC2626" : "var(--text)",
                    fontSize: l.style === "retenue" ? "clamp(14px, 3.5vw, 18px)" : monoStyle.fontSize,
                    opacity: l.style === "retenue" ? 0.8 : 1,
                  }}>
                    {l.texte}
                  </pre>
                ))}
                <pre style={{ ...monoStyle, color: "var(--text)" }}>
                  {"─".repeat(Math.max(...posee.lignesAvant.map(l => l.texte.length), posee.resultatLigne.length))}
                </pre>
                {posee.lignesIntermediaires && posee.lignesIntermediaires.map((l, i) => (
                  <pre key={`inter-${i}`} style={{
                    ...monoStyle,
                    color: "#6B7280",
                    fontSize: posee.type === "division" ? "clamp(14px, 3.5vw, 18px)" : monoStyle.fontSize,
                  }}>
                    {l}
                  </pre>
                ))}
                {posee.lignesIntermediaires && posee.type === "multiplication" && (
                  <pre style={{ ...monoStyle, color: "var(--text)" }}>
                    {"─".repeat(Math.max(...(posee.lignesIntermediaires ?? []).map(l => l.length), posee.resultatLigne.length))}
                  </pre>
                )}
                <pre style={{ ...monoStyle, color: "#16A34A", fontWeight: 800 }}>
                  {posee.resultatLigne}
                </pre>
              </div>
            )}
          </div>

          {/* Resultat final en gros */}
          <div style={{
            background: "white",
            borderRadius: 16,
            padding: "24px",
            textAlign: "center",
            boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
            marginBottom: 32,
            border: `2px solid ${THEME_COLOR}`,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: THEME_COLOR, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Réponse
            </div>
            <div style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: "clamp(28px, 8vw, 40px)",
              fontWeight: 800,
              color: THEME_COLOR,
            }}>
              {String(calcul.reponse).replace(".", ",")}
            </div>
          </div>

          <Link href="/eleve/dashboard" style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "16px 32px", fontSize: 16, borderRadius: 999,
            textDecoration: "none",
            background: THEME_COLOR, color: "white",
            fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif",
            boxShadow: `0 4px 16px ${THEME_COLOR}33`,
          }}>
            <span className="ms" style={{ fontSize: 18 }}>home</span>
            Retour au tableau de bord
          </Link>
        </main>
      </div>
    );
  }

  // ---- Ecran en_cours et deuxieme_chance ----
  return (
    <div className="eleve-page" style={{ background: "#f8f5ff" }}>
      <nav style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 20px",
      }}>
        <Link href="/eleve/dashboard" style={{
          display: "flex", alignItems: "center", gap: 6,
          color: THEME_COLOR, fontWeight: 600, fontSize: 14,
          textDecoration: "none", padding: "6px 10px", borderRadius: 12,
          fontFamily: "Manrope, sans-serif",
        }}>
          <span className="ms" style={{ fontSize: 20 }}>arrow_back</span>
          Retour
        </Link>
        <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 17, color: "var(--pb-on-surface)" }}>
          Calcul du Jour
        </span>
        <div style={{ width: 60 }} />
      </nav>

      <main style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1.5rem 8rem", display: "flex", flexDirection: "column", alignItems: "center" }}>

        {/* Header */}
        <header style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: "clamp(2rem, 6vw, 2.75rem)",
            fontWeight: 800,
            letterSpacing: -1,
            color: "var(--pb-on-surface)",
            marginBottom: 8,
          }}>
            Calcul du Jour
            <span className="ms" style={{ fontSize: "clamp(1.5rem, 5vw, 2.25rem)", marginLeft: 10, verticalAlign: "middle", color: THEME_COLOR }}>calculate</span>
          </h1>
          <p style={{ color: "var(--pb-on-surface-variant)", fontWeight: 500, letterSpacing: "0.02em", fontSize: 14 }}>
            Pose ton calcul et trouve le résultat !
          </p>
        </header>

        {/* Message deuxieme chance */}
        {state === "deuxieme_chance" && (
          <div style={{
            width: "100%", textAlign: "center", padding: "14px 20px",
            background: "rgba(245, 158, 11, 0.08)", borderRadius: 14, marginBottom: 20,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            border: "1px solid rgba(245, 158, 11, 0.2)",
          }}>
            <span className="ms" style={{ fontSize: 22, color: "#F59E0B" }}>warning</span>
            <span style={{ fontWeight: 600, fontSize: 15, color: "#B45309" }}>
              Ce n&apos;est pas tout à fait ça... Essaie encore !
            </span>
          </div>
        )}

        {/* Carte operation posee */}
        <div style={{
          width: "100%",
          position: "relative",
          overflow: "hidden",
          background: "white",
          borderRadius: 16,
          padding: "2rem 2.25rem",
          boxShadow: "0 10px 30px rgba(40,43,81,0.06)",
          marginBottom: 24,
        }}>
          {/* Barre laterale coloree */}
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: 6,
            borderRadius: "0 4px 4px 0",
            background: THEME_COLOR,
          }} />

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <span className="ms" style={{ fontSize: 20, color: THEME_COLOR }}>edit</span>
            <span style={{
              fontSize: 12, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.1em", color: THEME_COLOR,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}>
              Opération posée
            </span>
          </div>

          {(calcul.operation === "division" || calcul.operation === "/") ? (
            <div style={{ padding: "16px", background: "#fafafa", borderRadius: 12, display: "flex", justifyContent: "center" }}>
              <DivisionPotenceSimple a={calcul.nombre1} b={calcul.nombre2} />
            </div>
          ) : (
            <pre style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: "clamp(28px, 8vw, 40px)",
              fontWeight: 700,
              lineHeight: 1.6,
              textAlign: "right",
              margin: 0,
              color: "var(--text)",
              padding: "12px 16px",
              background: "#fafafa",
              borderRadius: 12,
            }}>
              {operationLines.join("\n")}
            </pre>
          )}
        </div>

        {/* Zone de saisie */}
        <div style={{
          width: "100%",
          background: `${THEME_COLOR}0D`,
          borderRadius: 16,
          padding: "2rem",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}>
          <label
            htmlFor="calcul-input"
            style={{ fontSize: 13, fontWeight: 700, color: "var(--pb-on-surface-variant)", marginLeft: 4 }}
          >
            Ta réponse
          </label>
          <div style={{ position: "relative" }}>
            <input
              id="calcul-input"
              type="text"
              inputMode="decimal"
              placeholder="Écris ta réponse ici"
              value={reponse}
              onChange={(e) => setReponse(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") verifier(); }}
              autoFocus
              style={{
                width: "100%",
                padding: "18px 52px 18px 20px",
                background: `${THEME_COLOR}14`,
                border: "none",
                borderRadius: 14,
                fontSize: 22,
                fontWeight: 700,
                color: "var(--pb-on-surface)",
                outline: "none",
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
                transition: "box-shadow 0.2s",
              }}
              onFocus={(e) => { e.currentTarget.style.boxShadow = `0 0 0 2px ${THEME_COLOR}`; }}
              onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }}
            />
            <span className="ms" style={{
              position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
              fontSize: 22, color: "var(--pb-outline-variant)", pointerEvents: "none",
            }}>
              calculate
            </span>
          </div>

          <button
            onClick={verifier}
            disabled={!reponse.trim()}
            style={{
              width: "100%",
              padding: "18px",
              background: THEME_COLOR,
              color: "white",
              border: "none",
              borderRadius: 999,
              fontSize: 17,
              fontWeight: 700,
              cursor: reponse.trim() ? "pointer" : "default",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              opacity: reponse.trim() ? 1 : 0.5,
              boxShadow: reponse.trim() ? `0 4px 16px ${THEME_COLOR}33` : "none",
              transition: "all 0.2s",
            }}
          >
            Vérifier
          </button>

          <p style={{ textAlign: "center", fontSize: 13, color: "var(--pb-on-surface-variant)", opacity: 0.7, fontWeight: 500 }}>
            {state === "deuxieme_chance"
              ? "Dernière tentative, concentre-toi bien !"
              : "Pose le calcul sur ton cahier puis écris le résultat"
            }
          </p>
        </div>
      </main>
    </div>
  );
}
