"use client";

import { useEffect, useState, useRef, useCallback, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

const DEFAULT_NAV_ITEMS = [
  { href: "/enseignant/dashboard",       label: "Tableau de bord", icon: "dashboard" },
  { href: "/enseignant/admin/planning",  label: "Planning",        icon: "calendar_month" },
  { href: "/enseignant/admin/chapitres", label: "Chapitres",       icon: "menu_book" },
  { href: "/enseignant/dictees",         label: "Dictées",         icon: "spellcheck" },
  { href: "/enseignant/bibliotheque",    label: "Bibliothèque",    icon: "library_books" },
  { href: "/enseignant/podcasts",        label: "Podcasts",        icon: "podcasts" },
  { href: "/enseignant/lecons",          label: "Leçons",          icon: "auto_stories" },
  { href: "/enseignant/ma-ptite-regle", label: "Ma P'tite Règle", icon: "ink_pen" },
  { href: "/enseignant/admin/eleves",    label: "Élèves & Groupes",icon: "group" },
  { href: "/enseignant/admin/qrcodes",   label: "QR codes",        icon: "qr_code_2" },
  { href: "/enseignant/daily-problem",   label: "Problème du jour", icon: "calculate" },
  { href: "/enseignant/atelier-ecriture",label: "Atelier écriture", icon: "edit_note" },
  { href: "/enseignant/bilan",           label: "Bilan de classe",  icon: "bar_chart" },
];

function buildNavFromOrder(order: string[]): typeof DEFAULT_NAV_ITEMS {
  const map = new Map(DEFAULT_NAV_ITEMS.map((item) => [item.href, item]));
  const sorted = order.map((href) => map.get(href)).filter(Boolean) as typeof DEFAULT_NAV_ITEMS;
  for (const item of DEFAULT_NAV_ITEMS) {
    if (!order.includes(item.href)) sorted.push(item);
  }
  return sorted;
}

interface Props {
  children: ReactNode;
}

export default function EnseignantLayout({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [autorise, setAutorise] = useState<boolean | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Drag & drop sidebar
  const [navItems, setNavItems] = useState(DEFAULT_NAV_ITEMS);
  const dragIdx = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const navLoaded = useRef(false);

  // Fermer la sidebar mobile quand on navigue
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  // Charger l'ordre depuis la BDD au montage
  useEffect(() => {
    if (navLoaded.current) return;
    navLoaded.current = true;
    fetch("/api/user-preferences")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.nav_order) && d.nav_order.length > 0) {
          setNavItems(buildNavFromOrder(d.nav_order));
        }
      })
      .catch(() => {});
  }, []);

  const onDragStart = useCallback((idx: number) => (e: React.DragEvent) => {
    dragIdx.current = idx;
    e.dataTransfer.effectAllowed = "move";
    // Image fantôme semi-transparente
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, 20, 20);
    }
  }, []);

  const onDragOver = useCallback((idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(idx);
  }, []);

  const onDrop = useCallback((idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const from = dragIdx.current;
    if (from === null || from === idx) { setDragOverIdx(null); return; }
    setNavItems((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(idx, 0, item);
      const order = next.map((n) => n.href);
      // Sauvegarder en BDD (fire & forget)
      fetch("/api/user-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nav_order: order }),
      }).catch(() => {});
      return next;
    });
    dragIdx.current = null;
    setDragOverIdx(null);
  }, []);

  const onDragEnd = useCallback(() => {
    dragIdx.current = null;
    setDragOverIdx(null);
  }, []);

  useEffect(() => {
    async function verifier() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/enseignant");
        return;
      }

      // Vérifier que l'utilisateur possède des classes (= est enseignant)
      const { data: classes } = await supabase
        .from("classe")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (!classes || classes.length === 0) {
        // Ce n'est pas un enseignant → rediriger vers l'espace élève
        router.push("/eleve/dashboard");
        return;
      }

      setEmail(user.email ?? "");
      setAutorise(true);
    }
    verifier();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function deconnecter() {
    await supabase.auth.signOut();
    router.push("/enseignant");
  }

  // Extraire un nom lisible depuis l'email
  const displayName = email
    ? email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : "Enseignant";

  // Initiales pour l'avatar
  const initials = displayName
    .split(" ")
    .map(w => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Ne rien afficher tant que la vérification n'est pas terminée
  if (autorise !== true) return null;

  return (
    <div className="ens-layout">
      {/* ── Overlay mobile ── */}
      <div
        className={`ens-sidebar-overlay${sidebarOpen ? " open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />
      {/* ── Sidebar ── */}
      <aside className={`ens-sidebar${sidebarOpen ? " open" : ""}`}>
        {/* Logo */}
        <div className="ens-sidebar-logo">
          <div className="ens-sidebar-logo-icon">
            <span className="ms">school</span>
          </div>
          <div>
            <h1>Plan Box</h1>
            <p>Espace enseignant</p>
          </div>
        </div>

        {/* Boutons principaux */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Link href="/enseignant/nouvelle-semaine" style={{ textDecoration: "none" }}>
            <button className="ens-sidebar-btn" type="button">
              <span className="ms" style={{ fontSize: 20 }}>date_range</span>
              <span>Nouvelle semaine</span>
            </button>
          </Link>
          <Link href="/enseignant/generer" style={{ textDecoration: "none" }}>
            <button className="ens-sidebar-btn" type="button" style={{ background: "var(--pb-secondary, #702ae1)" }}>
              <span className="ms" style={{ fontSize: 20 }}>edit_note</span>
              <span>Nouvel exercice</span>
            </button>
          </Link>
        </div>

        {/* Navigation (drag & drop pour réorganiser) */}
        <nav className="ens-sidebar-nav">
          {navItems.map(({ href, label, icon }, idx) => {
            const actif =
              pathname === href ||
              (href !== "/enseignant/dashboard" && pathname.startsWith(href));
            const isDragOver = dragOverIdx === idx;
            return (
              <Link
                key={href}
                href={href}
                draggable
                onDragStart={onDragStart(idx)}
                onDragOver={onDragOver(idx)}
                onDrop={onDrop(idx)}
                onDragEnd={onDragEnd}
                className={`ens-nav-item${actif ? " active" : ""}`}
                data-label={label}
                style={isDragOver ? {
                  borderTop: "2px solid var(--pb-primary, #0050D4)",
                  marginTop: -2,
                } : undefined}
              >
                <span className="ms ens-drag-handle">drag_indicator</span>
                <span className="ms">{icon}</span>
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="ens-sidebar-footer">
          <Link href="/enseignant/parametres" className="ens-nav-item" data-label="Paramètres">
            <span className="ms">settings</span>
            <span>Paramètres</span>
          </Link>
          <button onClick={deconnecter} className="ens-nav-item logout" type="button" data-label="Déconnexion">
            <span className="ms">logout</span>
            <span style={{ fontWeight: 600 }}>Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="ens-main-area">
        {/* Header */}
        <header className="ens-header">
          <button
            className="ens-hamburger"
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Menu"
          >
            <span className="ms" style={{ fontSize: 24 }}>menu</span>
          </button>
          <div className="ens-search">
            <span className="ms">search</span>
            <input
              type="text"
              placeholder="Rechercher un élève, un cours..."
            />
          </div>

          <div className="ens-header-actions">
            <button className="ens-header-icon" type="button" title="Notifications">
              <span className="ms">notifications</span>
              <span className="notif-dot" />
            </button>
            <button className="ens-header-icon" type="button" title="Aide">
              <span className="ms">help_outline</span>
            </button>

            <div className="ens-header-sep" />

            <div className="ens-header-profile">
              <div className="ens-header-profile-info">
                <p className="name">{displayName}</p>
                <p className="role">Enseignant</p>
              </div>
              <div className="ens-header-avatar">
                {initials}
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="ens-content">
          {children}
        </div>
      </div>
    </div>
  );
}
