import { foundryConfig } from "./config";

const { colors, border, radius, fonts, gutter } = foundryConfig.brand;

/** The brand block as CSS custom properties. Injected on :root so globals.css and Tailwind's theme tokens pick them up. */
export function brandCss(): string {
  const vars: Record<string, string> = {
    "--color-paper": colors.paper, "--color-card": colors.card, "--color-card-2": colors.card2,
    "--color-ink": colors.ink, "--color-ink-2": colors.ink2, "--color-muted": colors.muted,
    "--color-line": colors.line, "--color-line-2": colors.line2,
    "--color-side": colors.side, "--color-side-2": colors.side2, "--color-side-text": colors.sideText,
    "--color-amber": colors.accent, "--color-amber-deep": colors.accentDeep, "--color-amber-soft": colors.accentSoft,
    "--color-sky": colors.sky, "--color-sky-deep": colors.skyDeep,
    "--color-lilac": colors.lilac, "--color-lilac-deep": colors.lilacDeep,
    "--color-frame": colors.frame,
    "--border-color": border.color, "--border-width": border.width,
    "--frame-gutter": gutter,
    "--radius-frame": radius.frame, "--radius-card": radius.card, "--radius-control": radius.control, "--radius-chip": radius.chip, "--radius-pill": radius.pill,
    "--font-display": fonts.display,
  };
  return `:root{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";")}}`;
}
