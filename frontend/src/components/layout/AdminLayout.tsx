import { Outlet } from "react-router-dom";
import DashboardLayout from "./DashboardLayout";
import { adminNav, isNavBranch } from "./nav";
import { useAuth, type BrancheAcces } from "../../auth";

/** Correspondance entre l'id de navigation (nav.ts) et la valeur de l'enum Branche (backend). */
const NAV_ID_TO_BRANCHE: Record<string, BrancheAcces> = {
  "incendie-accident": "INCENDIE_ACCIDENT",
  relax: "RELAX",
};

export default function AdminLayout() {
  const { user } = useAuth();
  // Un admin ne voit dans le menu que les branches (Incendie/Accident, Relax)
  // auxquelles il a accès. Un SUPER_ADMIN a toujours accès aux deux (le champ
  // `branches` renvoyé par le backend reflète déjà cette règle).
  const branches = user?.branches;
  const nav = branches
    ? adminNav.filter((entry) => !isNavBranch(entry) || branches.includes(NAV_ID_TO_BRANCHE[entry.id]))
    : adminNav;

  return (
    <DashboardLayout
      nav={nav}
      userName={user?.nom ?? "Admin"}
      userMail={user?.email ?? ""}
      homeTo="/admin"
    >
      <Outlet />
    </DashboardLayout>
  );
}
