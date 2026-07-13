import { Outlet } from "react-router-dom";
import DashboardLayout from "./DashboardLayout";
import { agentImfNav } from "./nav";
import { useAuth } from "../../auth";

export default function AgentImfLayout() {
  const { user } = useAuth();
  return (
    <DashboardLayout
      nav={agentImfNav}
      userName={user?.nom ?? "Agent"}
      userMail={user?.email ?? ""}
      homeTo="/agent-imf"
    >
      <Outlet />
    </DashboardLayout>
  );
}
