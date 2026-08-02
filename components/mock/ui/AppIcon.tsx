"use client";
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";

function simpleIconUrl(slug?: string, color?: string): string | null {
  if (!slug) return null;
  const suffix = color ? `/${color.replace("#", "")}` : "";
  return `https://cdn.simpleicons.org/${slug}${suffix}`;
}

export default function AppIcon({
  name,
  slug,
  color,
  size = 34,
  className,
}: {
  name: string;
  slug?: string;
  color?: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = !failed ? simpleIconUrl(slug, color) : null;

  if (!url) {
    return (
      <span
        className={className}
        aria-hidden
        style={{
          width: size,
          height: size,
          borderRadius: 10,
          display: "grid",
          placeItems: "center",
          background: "color-mix(in srgb, var(--oa-soft-blue) 34%, white)",
          border: "1px solid color-mix(in srgb, var(--oa-border) 88%, white)",
          color: "var(--oa-blue-dark)",
          fontSize: Math.max(10, Math.round(size * 0.32)),
          fontWeight: 800,
          letterSpacing: "0.01em",
          flex: "none",
        }}
      >
        {name.slice(0, 2).toUpperCase()}
      </span>
    );
  }

  return (
    <span
      className={className}
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        display: "grid",
        placeItems: "center",
        background: "var(--oa-surface)",
        border: "1px solid color-mix(in srgb, var(--oa-border) 88%, white)",
        flex: "none",
        overflow: "hidden",
      }}
    >
      <img
        src={url}
        alt=""
        width={Math.round(size * 0.62)}
        height={Math.round(size * 0.62)}
        style={{ display: "block" }}
        onError={() => setFailed(true)}
      />
    </span>
  );
}
