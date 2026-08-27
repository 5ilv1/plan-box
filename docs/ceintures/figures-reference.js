/**
 * Implémentation de référence des trois figures — extraite du banc d'essai.
 *
 * Contrat : docs/ceintures/SPEC-FIGURES.md.
 * Ce fichier n'est PAS importé par l'application : c'est la référence de rendu,
 * à porter en React dans components/FigureGeo.tsx. Les cas de contrôle rendus
 * par ces fonctions ont été validés à l'œil.
 *
 * `esc` échappe le texte injecté dans le SVG ; en React, le JSX s'en charge.
 */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function svgCadran(c) {
  const h = Number(c.heures) % 12, m = Number(c.minutes || 0);
  const R = 96, cx = 110, cy = 110;
  const pt = (ang, r) => [cx + r * Math.sin(ang), cy - r * Math.cos(ang)];
  let g = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="currentColor" stroke-width="3"/>`;
  for (let i = 0; i < 60; i++) {
    const a = (i * Math.PI) / 30, gros = i % 5 === 0;
    const [x1, y1] = pt(a, R - (gros ? 12 : 5)), [x2, y2] = pt(a, R - 1);
    g += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"
            stroke="currentColor" stroke-width="${gros ? 2.5 : 1}"/>`;
  }
  if (c.chiffres !== false) {
    for (let i = 1; i <= 12; i++) {
      const [x, y] = pt((i * Math.PI) / 6, R - 27);
      g += `<text x="${x.toFixed(1)}" y="${(y + 6).toFixed(1)}" text-anchor="middle"
              font-size="18" font-weight="700" fill="currentColor">${i}</text>`;
    }
  }
  const aH = ((h + m / 60) * Math.PI) / 6, aM = (m * Math.PI) / 30;
  const [hx, hy] = pt(aH, R * 0.52), [mx, my] = pt(aM, R * 0.78);
  g += `<line x1="${cx}" y1="${cy}" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}"
          stroke="var(--belt,#c0392b)" stroke-width="7" stroke-linecap="round"/>`;
  g += `<line x1="${cx}" y1="${cy}" x2="${mx.toFixed(1)}" y2="${my.toFixed(1)}"
          stroke="currentColor" stroke-width="4" stroke-linecap="round"/>`;
  g += `<circle cx="${cx}" cy="${cy}" r="6" fill="currentColor"/>`;
  return `<svg viewBox="0 0 220 220" width="200" height="200" role="img"
      aria-label="cadran à aiguilles">${g}</svg>`;
}

function svgAngle(a) {
  const d = Number(a.degres), L = 150, ox = 30, oy = 160;
  const rad = (d * Math.PI) / 180;
  const bx = ox + L, by = oy;
  const ax = ox + L * Math.cos(rad), ay = oy - L * Math.sin(rad);
  const droit = Math.abs(d - 90) < 0.5;
  let g = `<line x1="${ox}" y1="${oy}" x2="${bx}" y2="${oy}" stroke="currentColor" stroke-width="3"/>`;
  g += `<line x1="${ox}" y1="${oy}" x2="${ax.toFixed(1)}" y2="${ay.toFixed(1)}" stroke="currentColor" stroke-width="3"/>`;
  if (droit) {
    g += `<path d="M${ox + 26} ${oy} v-26 h-26" fill="none" stroke="var(--belt,#c0392b)" stroke-width="2.5"/>`;
  } else {
    const r = 40, ex = ox + r * Math.cos(rad), ey = oy - r * Math.sin(rad);
    g += `<path d="M${ox + r} ${oy} A ${r} ${r} 0 0 0 ${ex.toFixed(1)} ${ey.toFixed(1)}"
            fill="none" stroke="var(--belt,#c0392b)" stroke-width="2.5"/>`;
  }
  if (a.nom) g += `<text x="${ox - 6}" y="${oy + 20}" font-size="17" font-weight="800"
      fill="currentColor" text-anchor="middle">${esc(a.nom)}</text>`;
  return `<svg viewBox="0 0 200 180" width="100%" style="max-width:280px" role="img"
      aria-label="angle">${g}</svg>`;
}

function svgPolygone(f) {
  const G = f.grille, pol = f.polygones || [], seg = f.segments || [], pts = f.points || [], cer = f.cercles || [];
  let maxX = G ? G.colonnes : 10, maxY = G ? G.lignes : 8;
  const tous = [...pol.flatMap((p) => p.sommets), ...seg.flatMap((s) => [s.de, s.a]), ...pts.map((p) => p.at),
    ...cer.flatMap((c) => [[c.centre[0] - c.rayon, c.centre[1] - c.rayon], [c.centre[0] + c.rayon, c.centre[1] + c.rayon]])];
  tous.forEach(([x, y]) => { maxX = Math.max(maxX, x + 1); maxY = Math.max(maxY, y + 1); });
  const U = 34, M = 22, W = maxX * U + 2 * M, H = maxY * U + 2 * M;
  const X = (x) => M + x * U, Y = (y) => H - M - y * U;   // origine en bas à gauche
  let g = "";
  if (G) {
    for (let i = 0; i <= maxX; i++) g += `<line x1="${X(i)}" y1="${Y(0)}" x2="${X(i)}" y2="${Y(maxY)}" stroke="currentColor" stroke-width="1" opacity=".22"/>`;
    for (let j = 0; j <= maxY; j++) g += `<line x1="${X(0)}" y1="${Y(j)}" x2="${X(maxX)}" y2="${Y(j)}" stroke="currentColor" stroke-width="1" opacity=".22"/>`;
  }
  cer.forEach((c) => {
    g += `<circle cx="${X(c.centre[0])}" cy="${Y(c.centre[1])}" r="${c.rayon * U}"
            fill="var(--belt,#888)" fill-opacity="${c.plein === false ? 0 : .1}"
            stroke="currentColor" stroke-width="2.8" ${c.pointille ? 'stroke-dasharray="7 5"' : ""}/>`;
    g += `<circle cx="${X(c.centre[0])}" cy="${Y(c.centre[1])}" r="3.5" fill="currentColor"/>`;
    if (c.nom) g += `<text x="${X(c.centre[0])}" y="${Y(c.centre[1]) - 9}" text-anchor="middle"
            font-size="15" font-weight="700" fill="currentColor">${esc(c.nom)}</text>`;
  });
  seg.forEach((s) => {
    g += `<line x1="${X(s.de[0])}" y1="${Y(s.de[1])}" x2="${X(s.a[0])}" y2="${Y(s.a[1])}"
            stroke="currentColor" stroke-width="2.5" ${s.pointille ? 'stroke-dasharray="7 5"' : ""}/>`;
    if (s.nom) g += `<text x="${X(s.a[0]) + 8}" y="${Y(s.a[1]) - 6}" font-size="15" font-weight="700" fill="currentColor">${esc(s.nom)}</text>`;
  });
  pol.forEach((p) => {
    const S = p.sommets, d = S.map(([x, y], i) => `${i ? "L" : "M"}${X(x)} ${Y(y)}`).join(" ") + " Z";
    g += `<path d="${d}" fill="var(--belt,#888)" fill-opacity="${p.plein === false ? 0 : .12}"
            stroke="currentColor" stroke-width="2.8" stroke-linejoin="round"/>`;
    // marque d'angle droit : petit carré au sommet
    (p.angles_droits || []).forEach((i) => {
      const n = S.length, [ax, ay] = S[i], [px, py] = S[(i - 1 + n) % n], [nx, ny] = S[(i + 1) % n];
      const u = (a, b) => { const l = Math.hypot(a, b) || 1; return [a / l, b / l]; };
      const [u1x, u1y] = u(px - ax, py - ay), [u2x, u2y] = u(nx - ax, ny - ay);
      const t = 13 / U;
      const P = (dx, dy) => `${X(ax + dx)} ${Y(ay + dy)}`;
      g += `<path d="M${P(u1x * t, u1y * t)} L${P((u1x + u2x) * t, (u1y + u2y) * t)} L${P(u2x * t, u2y * t)}"
              fill="none" stroke="var(--belt,#c0392b)" stroke-width="2.2"/>`;
    });
    // marques d'égalité : n petits traits au milieu du côté
    (p.cotes_egaux || []).forEach(([i, nb]) => {
      const n = S.length, [ax, ay] = S[i], [bx, by] = S[(i + 1) % n];
      const mx = (X(ax) + X(bx)) / 2, my = (Y(ay) + Y(by)) / 2;
      const dx = X(bx) - X(ax), dy = Y(by) - Y(ay), l = Math.hypot(dx, dy) || 1;
      const nxp = -dy / l * 7, nyp = dx / l * 7, tx = dx / l * 4, ty = dy / l * 4;
      for (let k = 0; k < (nb || 1); k++) {
        const o = (k - ((nb || 1) - 1) / 2) * 5;
        g += `<line x1="${mx + o * dx / l - nxp}" y1="${my + o * dy / l - nyp}"
                x2="${mx + o * dx / l + nxp}" y2="${my + o * dy / l + nyp}"
                stroke="var(--belt,#c0392b)" stroke-width="2.2"/>`;
      }
    });
    (p.noms || (p.nom ? p.nom.split("") : [])).forEach((nom, i) => {
      if (!S[i]) return;
      const [cx, cy] = S.reduce((a, [x, y]) => [a[0] + x / S.length, a[1] + y / S.length], [0, 0]);
      const dx = S[i][0] - cx, dy = S[i][1] - cy, l = Math.hypot(dx, dy) || 1;
      g += `<text x="${X(S[i][0] + dx / l * 0.42)}" y="${Y(S[i][1] + dy / l * 0.42) + 5}"
              text-anchor="middle" font-size="15" font-weight="700" fill="currentColor">${esc(nom)}</text>`;
    });
  });
  pts.forEach((p) => {
    g += `<circle cx="${X(p.at[0])}" cy="${Y(p.at[1])}" r="4.5" fill="var(--belt,#c0392b)"/>`;
    if (p.nom) g += `<text x="${X(p.at[0])}" y="${Y(p.at[1]) - 10}" text-anchor="middle"
            font-size="15" font-weight="700" fill="currentColor">${esc(p.nom)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${Math.min(W, 420)}px"
      role="img" aria-label="figure géométrique">${g}</svg>`;
}

function svgFigure(f) {
  if (!f) return "";
  const corps = f.type === "cadran" ? svgCadran(f)
    : f.type === "angle" ? svgAngle(f)
    : f.type === "polygone" ? svgPolygone(f) : "";
  return corps ? `<div class="figure">${corps}</div>` : "";
}
