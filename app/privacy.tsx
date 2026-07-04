import { LegalDocumentView } from "@/components/LegalDocumentView";
import { PRIVACY_POLICY } from "@/lib/legal";

export default function PrivacyScreen() {
  return (
    <LegalDocumentView
      doc={PRIVACY_POLICY}
      peers={[
        { href: "/terms", label: "Terms & Conditions" },
        { href: "/disclosures", label: "Funding / AI / Communications Disclosure" },
      ]}
    />
  );
}
