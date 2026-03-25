"use client";

import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Worker PDF.js via CDN (pas de config webpack nécessaire)
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface Props {
  url: string;          // blob URL ou URL publique
  hauteur?: number;     // hauteur en px du viewer (défaut 600)
}

export default function PdfViewer({ url, hauteur = 600 }: Props) {
  const [nbPages,    setNbPages]    = useState<number>(0);
  const [pageActuelle, setPageActuelle] = useState<number>(1);
  const [largeur,    setLargeur]    = useState<number>(600);
  const [erreur,     setErreur]     = useState<string>("");

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNbPages(numPages);
    setPageActuelle(1);
  }, []);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const obs = new ResizeObserver(() => setLargeur(node.offsetWidth));
    obs.observe(node);
    setLargeur(node.offsetWidth);
  }, []);

  if (erreur) {
    return (
      <div style={{ textAlign: "center", padding: 32, color: "#EF4444" }}>
        <p style={{ marginBottom: 12 }}>Impossible de charger le PDF.</p>
        <a href={url} target="_blank" rel="noreferrer"
          style={{ color: "#2563EB", fontWeight: 600, fontSize: 14 }}>
          Ouvrir directement →
        </a>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ width: "100%", userSelect: "none" }}>
      {/* ── Viewer PDF ── */}
      <div style={{
        height: hauteur,
        overflow: "auto",
        background: "#f0f0f0",
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "16px 0",
        gap: 12,
      }}>
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={() => setErreur("Erreur de chargement")}
          loading={
            <div style={{ padding: 40, color: "#6B7280", fontSize: 14 }}>
              Chargement du document…
            </div>
          }
        >
          <Page
            pageNumber={pageActuelle}
            width={Math.min(largeur - 32, 800)}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        </Document>
      </div>

      {/* ── Navigation (multi-pages) ── */}
      {nbPages > 1 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 16, marginTop: 12,
        }}>
          <button
            onClick={() => setPageActuelle((p) => Math.max(1, p - 1))}
            disabled={pageActuelle <= 1}
            style={{
              border: "none", background: pageActuelle <= 1 ? "#E5E7EB" : "var(--pb-primary, #5B21B6)",
              color: pageActuelle <= 1 ? "#9CA3AF" : "white",
              borderRadius: 8, padding: "8px 16px", cursor: pageActuelle <= 1 ? "default" : "pointer",
              fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 14,
            }}
          >
            ← Précédente
          </button>
          <span style={{ fontSize: 13, color: "#6B7280", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {pageActuelle} / {nbPages}
          </span>
          <button
            onClick={() => setPageActuelle((p) => Math.min(nbPages, p + 1))}
            disabled={pageActuelle >= nbPages}
            style={{
              border: "none", background: pageActuelle >= nbPages ? "#E5E7EB" : "var(--pb-primary, #5B21B6)",
              color: pageActuelle >= nbPages ? "#9CA3AF" : "white",
              borderRadius: 8, padding: "8px 16px", cursor: pageActuelle >= nbPages ? "default" : "pointer",
              fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 14,
            }}
          >
            Suivante →
          </button>
        </div>
      )}
    </div>
  );
}
