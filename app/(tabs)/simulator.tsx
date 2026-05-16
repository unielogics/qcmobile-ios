import { useExperienceMode } from "@/hooks/useExperienceMode";
import { DealAnalyzerScreen } from "@/screens/deal-analyzer/DealAnalyzerScreen";
import { SelfDirectedSimulatorScreen } from "@/screens/simulator/SimulatorScreen";

export default function SimulatorRoute() {
  const mode = useExperienceMode();
  // Guided: the "My Deal" tab is now the Deal Analyzer.
  if (mode === "guided") return <DealAnalyzerScreen />;
  if (mode === "self_directed") return <SelfDirectedSimulatorScreen />;
  return null;
}
