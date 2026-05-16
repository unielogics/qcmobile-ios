// Reuses the borrower calendar screen verbatim — backend scopes
// /calendar by the signed-in user, so agents see their own events
// without any UI changes. Routed under /agent/calendar so the
// AuthGate doesn't bounce broker users out of the (tabs) group.
import CalendarScreen from "../(tabs)/calendar";

export default function AgentCalendarRoute() {
  return <CalendarScreen />;
}
