import { useExperienceMode } from "@/hooks/useExperienceMode";
import { GuidedHome } from "@/screens/home/GuidedHome";
import { SelfDirectedHome } from "@/screens/home/SelfDirectedHome";

export default function HomeRoute() {
  const mode = useExperienceMode();
  // Tabs layout already gates loading/unlinked — defensive narrow
  // here so we never silently render self_directed for an unlinked
  // user if someone later mounts this screen outside the tab nav.
  if (mode === "guided") return <GuidedHome />;
  if (mode === "self_directed") return <SelfDirectedHome />;
  return null;
}
