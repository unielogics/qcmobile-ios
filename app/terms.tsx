import { LegalDocumentView } from "@/components/LegalDocumentView";
import { TERMS_AND_CONDITIONS } from "@/lib/legal";

export default function TermsScreen() {
  return (
    <LegalDocumentView
      doc={TERMS_AND_CONDITIONS}
      peers={[
        { href: "/privacy", label: "Privacy Policy" },
        { href: "/disclosures", label: "Funding / AI / Communications Disclosure" },
      ]}
    />
  );
}
