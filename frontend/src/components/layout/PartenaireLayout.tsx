import { Outlet } from "react-router-dom";
import DashboardLayout from "./DashboardLayout";
import { partenaireNav } from "./nav";
import { useAuth } from "../../auth";

export default function PartenaireLayout() {
  const { user } = useAuth();
  return (
    <DashboardLayout
      nav={partenaireNav}
      brandName={user?.commerce ?? "Mon commerce"}
      brandSub="Espace Partenaire"
      userName={user?.nom ?? "Partenaire"}
      userMail={user?.email ?? ""}
      homeTo="/partenaire"
    >
      <Outlet />
    </DashboardLayout>
  );
}
