// Direct port of .design/qualified-commercial/project/tokens.js (mobile-shared)

export type ThemeMode = "light" | "dark";

export interface QCTokens {
  bg: string;
  surface: string;
  surface2: string;
  elevated: string;
  line: string;
  lineStrong: string;
  ink: string;
  ink2: string;
  ink3: string;
  ink4: string;
  inverse: string;
  brand: string;
  brandSoft: string;
  petrol: string;
  petrolSoft: string;
  gold: string;
  goldSoft: string;
  profit: string;
  profitBg: string;
  warn: string;
  warnBg: string;
  danger: string;
  dangerBg: string;
  chip: string;
  spark: string;
  // Aliases used by newer agent-side files (ai-assistant settings,
  // ClientAIPlanCard, RealtorReadinessCard) that were authored against
  // a desktop-style palette. Mapped to the existing tokens so those
  // screens render with proper colors instead of black/transparent.
  muted: string;
  border: string;
  accent: string;
}

export const QC_TOKENS: Record<ThemeMode, QCTokens> = {
  light: {
    bg: "#F4F1EA",
    surface: "#FFFFFF",
    surface2: "#FAF7F1",
    elevated: "#FFFFFF",
    line: "rgba(11, 22, 41, 0.08)",
    lineStrong: "rgba(11, 22, 41, 0.16)",
    ink: "#0B1629",
    ink2: "#3C4A60",
    ink3: "#6B7891",
    ink4: "#A2ABBD",
    inverse: "#FFFFFF",
    brand: "#0B1F3A",
    brandSoft: "#E6ECF5",
    petrol: "#0F5F66",
    petrolSoft: "#D9EAEB",
    gold: "#B98A2E",
    goldSoft: "#F5EBD3",
    profit: "#0B7A3E",
    profitBg: "#DCEFE2",
    warn: "#A86A12",
    warnBg: "#F8EAD1",
    danger: "#B0322F",
    dangerBg: "#F4DAD8",
    chip: "#EFEAE0",
    spark: "#0B1F3A",
    muted: "#6B7891",   // = ink3
    border: "rgba(11, 22, 41, 0.08)", // = line
    accent: "#0F5F66",  // = petrol
  },
  dark: {
    bg: "#06070B",
    surface: "#0D1018",
    surface2: "#11151F",
    elevated: "#161B27",
    line: "rgba(255,255,255,0.07)",
    lineStrong: "rgba(255,255,255,0.14)",
    ink: "#F1F5F9",
    ink2: "#C5CDDB",
    ink3: "#8892A6",
    ink4: "#5A6378",
    inverse: "#06070B",
    brand: "#5EEAD4",
    brandSoft: "rgba(94,234,212,0.10)",
    petrol: "#22D3C7",
    petrolSoft: "rgba(34,211,199,0.12)",
    gold: "#E0B85A",
    goldSoft: "rgba(224,184,90,0.12)",
    profit: "#34D399",
    profitBg: "rgba(52,211,153,0.13)",
    warn: "#F4B95A",
    warnBg: "rgba(244,185,90,0.13)",
    danger: "#F87171",
    dangerBg: "rgba(248,113,113,0.13)",
    chip: "rgba(255,255,255,0.06)",
    spark: "#5EEAD4",
    muted: "#8892A6",   // = ink3
    border: "rgba(255,255,255,0.07)", // = line
    accent: "#22D3C7",  // = petrol
  },
};

export type Density = "comfortable" | "compact";
export const QC_DENSITY: Record<Density, { pad: number; gap: number; cardPad: number; rowH: number; fs: number }> = {
  comfortable: { pad: 16, gap: 14, cardPad: 18, rowH: 56, fs: 1.0 },
  compact:     { pad: 12, gap: 10, cardPad: 14, rowH: 48, fs: 0.94 },
};

export const QC_FMT = {
  usd: (n: number, dec = 0) =>
    n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: dec,
      minimumFractionDigits: dec,
    }),
  pct: (n: number, dec = 2) => `${n.toFixed(dec)}%`,
  bps: (n: number) => `${n > 0 ? "+" : ""}${n} bps`,
  num: (n: number) => n.toLocaleString("en-US"),
  short: (n: number) => {
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}k`;
    return `$${n}`;
  },
};
