"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

const NAV = [
  { href: "/enseignant/dashboard",       label: "Tableau de bord" },
  { href: "/enseignant/admin/planning",  label: "Planning" },
  { href: "/enseignant/admin/chapitres", label: "Chapitres" },
  { href: "/enseignant/dictees",         label: "Dictées" },
  { href: "/enseignant/bibliotheque",    label: "Bibliothèque" },
  { href: "/enseignant/lecons",          label: "Leçons" },
  { href: "/enseignant/admin/eleves",    label: "Élèves & Groupes" },
  { href: "/enseignant/admin/qrcodes",  label: "QR codes" },
  { href: "/enseignant/daily-problem",  label: "Problème du jour" },
];

export default function AdminHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setEmail(user.email);
    });
  }, []);

  async function deconnecter() {
    await supabase.auth.signOut();
    router.push("/enseignant");
  }

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "white",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "0 16px",
        height: 48,
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}
    >
      {/* Logo */}
      <Link
        href="/enseignant/dashboard"
        style={{
          display: "flex",
          alignItems: "center",
          textDecoration: "none",
          marginRight: 12,
          flexShrink: 0,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/planbox-logo.png"
          alt="Planbox"
          style={{ height: 30, width: "auto", objectFit: "contain" }}
        />
      </Link>

      {/* Nav links */}
      <nav style={{ display: "flex", gap: 2, flex: 1, overflowX: "auto" }}>
        {NAV.map(({ href, label }) => {
          const actif =
            pathname === href ||
            (href !== "/enseignant/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              style={{
                padding: "5px 10px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: actif ? 700 : 500,
                color: actif ? "var(--primary)" : "var(--text-secondary)",
                background: actif ? "var(--primary-pale)" : "transparent",
                textDecoration: "none",
                whiteSpace: "nowrap",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User + déconnexion */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
          marginLeft: 8,
        }}
      >
        {email && (
          <span
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              maxWidth: 180,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {email}
          </span>
        )}
        <button
          onClick={deconnecter}
          style={{
            padding: "4px 10px",
            fontSize: 12,
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: 6,
            cursor: "pointer",
            color: "var(--text-secondary)",
            fontFamily: "var(--font)",
            whiteSpace: "nowrap",
          }}
        >
          Déconnexion
        </button>
      </div>
    </header>
  );
}
