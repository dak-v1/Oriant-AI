/* eslint-disable @next/next/no-img-element -- fixed-size local brand PNGs that
   need a CSS colour filter; next/image adds no value and blocks the filter. */
/**
 * BrandLogo — the Oriant brand mark, rendered from the supplied logo art
 * as ONE cohesive image (public/brand/lockup.png = the "ORIANT" wordmark with
 * the compass star in place of the letter A). The star and text are never
 * split apart.
 *
 *   variant="lockup"  the full ORIANT logo, star as the "A" (default)
 *   variant="star"    the compass star only (for icon-only spots)
 *
 * The art is a single ink colour on transparency, so `tone="light"` recolours
 * it to white with a CSS filter for dark surfaces (no separate asset needed).
 * `size` is the mark height in px; width follows the image's aspect ratio.
 */

const LOCKUP_RATIO = 982 / 260; // w / h  (ORIANT wordmark)
const STAR_RATIO = 261 / 300; // w / h  (compass star)

export default function BrandLogo({
  variant = "lockup",
  tone = "ink",
  size = 26,
  className,
  title = "Oriant",
}: {
  variant?: "lockup" | "star";
  tone?: "ink" | "light";
  size?: number;
  className?: string;
  title?: string;
}) {
  const filter = tone === "light" ? "brightness(0) invert(1)" : undefined;
  const isStar = variant === "star";
  const src = isStar ? "/brand/star.png" : "/brand/lockup.png";
  const ratio = isStar ? STAR_RATIO : LOCKUP_RATIO;
  const w = Math.round(size * ratio);

  return (
    <span
      className={className}
      role="img"
      aria-label={title}
      style={{ display: "inline-flex", alignItems: "center" }}
    >
      <img
        src={src}
        alt=""
        aria-hidden
        width={w}
        height={size}
        style={{ width: w, height: size, filter, display: "block" }}
      />
    </span>
  );
}
