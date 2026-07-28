import { Outlet } from "react-router-dom";
import DashboardLayout from "./DashboardLayout";
import { adminNav, isNavBranch } from "./nav";
import { useAuth, type BrancheAcces } from "../../auth";

/** Correspondance entre l'id de navigation (nav.ts) et la valeur de l'enum Branche (backend). */
const NAV_ID_TO_BRANCHE: Record<string, BrancheAcces> = {
  "incendie-accident": "INCENDIE_ACCIDENT",
  relax: "RELAX",
  imf: "IMF",
};

export default function AdminLayout() {
  const { user } = useAuth();
  // Un admin ne voit dans le menu que les branches (Incendie/Accident, Relax, IMF)
  // auxquelles il a accès. Un SUPER_ADMIN a toujours accès à toutes (le champ
  // `branches` renvoyé par le backend reflète déjà cette règle).
  const branches = user?.branches;
  // « Administration générale » (journal d'audit, comptes admin, paramètres)
  // est visible du SUPER_ADMIN global (tout), et — filtrée — d'un
  // BRANCH_SUPER_ADMIN : Administrateurs (scopé à sa branche côté backend),
  // Paramètres seulement s'il a la branche Incendie/Accident (seule branche
  // couverte par cette page), jamais le Journal d'audit (réservé au global).
  const estSuperAdmin = user?.role === "SUPER_ADMIN";
  const estBranchSuperAdmin = user?.role === "BRANCH_SUPER_ADMIN";
  const nav = adminNav
    .filter((entry) => !isNavBranch(entry) || !branches || branches.includes(NAV_ID_TO_BRANCHE[entry.id]))
    .filter((entry) => estSuperAdmin || estBranchSuperAdmin || isNavBranch(entry) || entry.section !== "Administration générale")
    .map((entry) => {
      if (isNavBranch(entry) || entry.section !== "Administration générale" || estSuperAdmin) return entry;
      return {
        ...entry,
        items: entry.items.filter((item) => {
          if (item.to === "/admin/journal") return false;
          if (item.to === "/admin/parametres") return branches?.includes("INCENDIE_ACCIDENT");
          return true;
        }),
      };
    });

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
