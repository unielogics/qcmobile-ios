// Broker bottom-tab Calendar. Reuses the borrower calendar screen —
// backend scopes /calendar by the signed-in user, so agents see
// their own events without UI changes.
import CalendarScreen from "../../(tabs)/calendar";

export default function AgentTabsCalendarRoute() {
  return <CalendarScreen />;
}
