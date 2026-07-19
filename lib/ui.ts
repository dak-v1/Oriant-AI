import type { CSSProperties } from "react";

/**
 * sx — inline-style helper that admits CSS custom properties.
 *
 * The design source keeps every style inline; hover styles come from the
 * `.hv-*` utility classes in globals.css, driven by `--hv-*` custom props:
 *
 *   <button className="hv-bg hv-tf"
 *     style={sx({ background: "var(--ink)", "--hv-bg": "var(--ember)", "--hv-tf": "translateY(-2px)" })}>
 */
export type SXProps = CSSProperties & Record<`--${string}`, string | number>;

export function sx(styles: SXProps): CSSProperties {
  return styles as CSSProperties;
}

export const fmtMoney = (n: number) => "$" + n.toLocaleString();
