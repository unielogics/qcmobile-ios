import { type ReactNode } from "react";

export function FundingAccessGate({ children }: { children: ReactNode }) {
  // Credit access is intentionally non-blocking. Each screen that uses
  // credit-derived features renders its own compact callout/CTA, so this
  // wrapper must never mount a modal over the tab navigator.
  return <>{children}</>;
}
