// Reuses the existing profile screen — it already gates the
// client-only sections via `isClient`, so a broker sees the
// account-level fields without any borrower copy.
import ProfileScreen from "../(tabs)/profile";

export default function AgentProfileRoute() {
  return <ProfileScreen />;
}
