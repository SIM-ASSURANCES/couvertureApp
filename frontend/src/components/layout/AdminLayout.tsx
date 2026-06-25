import { Outlet } from "react-router-dom";
import DashboardLayout from "./DashboardLayout";
import { adminNav } from "./nav";
import { useAuth } from "../../auth";

export default function AdminLayout() {
  const { user } = useAuth();
  return (
    <DashboardLayout
      nav={adminNav}
      userName={user?.nom ?? "Admin"}
      userMail={user?.email ?? ""}
      homeTo="/admin"
    >
      <Outlet />
    </DashboardLayout>
  );
}
