"use client";

interface ProgressBarProps {
  pourcentage: number; // 0–100
  variant?: "default" | "success" | "warning";
  hauteur?: number;
  showLabel?: boolean;
}

export default function ProgressBar({
  pourcentage,
  variant = "default",
  hauteur = 8,
  showLabel = false,
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, pourcentage));

  const variantClass =
    variant === "success"
      ? " success"
      : variant === "warning"
      ? " warning"
      : "";

  return (
    <div>
      <div className="progress-track" style={{ height: hauteur }}>
        <div
          className={`progress-fill${variantClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-secondary text-xs" style={{ marginTop: 4, display: "block" }}>
          {pct}%
        </span>
      )}
    </div>
  );
}
