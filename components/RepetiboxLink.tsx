"use client";

export default function RepetiboxLink() {
  const url = (process.env.NEXT_PUBLIC_REPETIBOX_URL || "https://leitner-app-kohl.vercel.app") + "/eleve/revision/leitner";

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="btn-ghost"
      style={{ fontSize: 13 }}
    >
      Aller sur Repetibox →
    </a>
  );
}
