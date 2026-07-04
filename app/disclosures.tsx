import { LegalDocumentView } from "@/components/LegalDocumentView";
import { FUNDING_AI_DISCLOSURE } from "@/lib/legal";

export default function DisclosuresScreen() {
  return (
    <LegalDocumentView
      doc={FUNDING_AI_DISCLOSURE}
      peers={[
        { href: "/privacy", label: "Privacy Policy" },
        { href: "/terms", label: "Terms & Conditions" },
      ]}
    />
  );
}
