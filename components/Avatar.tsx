"use client";

import { BigHead } from "@bigheads/core";
import { resolveBigHeadProps, type BigHeadsOptions } from "@/lib/bigheads";

type AvatarProps = {
  /** Options de l'élève (avatar_bigheads). null/absent → défaut déterministe depuis le prénom. */
  options?: BigHeadsOptions | unknown | null;
  /** Graine du défaut déterministe (le prénom). */
  seed?: string;
  /** Diamètre en pixels. */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * Avatar BigHeads généré en local. L'avatar est stocké côté Repetibox
 * (eleve.avatar_bigheads) ; Plan Box ne fait que l'afficher.
 */
export default function Avatar({ options, seed = "", size = 40, className, style }: AvatarProps) {
  const props = resolveBigHeadProps(options ?? null, seed);
  return (
    <span
      className={`bh-avatar${className ? " " + className : ""}`}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: "#C6E9DA",
        overflow: "hidden",
        display: "inline-block",
        flexShrink: 0,
        ...style,
      }}
    >
      <BigHead {...props} />
    </span>
  );
}
