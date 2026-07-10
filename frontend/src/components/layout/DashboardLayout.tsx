import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { ChevronsLeft, ChevronsRight, ChevronDown, LogOut, Menu } from "lucide-react";
import { isNavBranch, type AdminNavEntry, type NavGroup } from "./nav";
import { useAuth } from "../../auth";
import NotificationsBell from "../NotificationsBell";

interface Props {
  nav: AdminNavEntry[];
  userName: string;
  userMail: string;
  homeTo: string;
  children: React.ReactNode;
}

function renderGroup(group: NavGroup, collapsed: boolean, homeTo: string) {
  return (
    <div key={group.section}>
      {!collapsed && <div className="nav-section">{group.section}</div>}
      {group.items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === homeTo}
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            title={item.label}
          >
            <Icon size={19} />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        );
      })}
    </div>
  );
}

export default function DashboardLayout({
  nav,
  userName,
  userMail,
  homeTo,
  children,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();

  const branchIds = nav.filter(isNavBranch).map((b) => b.id);
  // "/admin" est la racine du layout entier (incendie/accident ET relax y sont
  // nichés) : on ne peut donc la faire matcher que par égalité stricte, jamais
  // par préfixe, sous peine de faire croire que "/admin/relax/…" appartient à
  // la branche Incendie/Accident.
  function itemMatchesPath(to: string) {
    if (location.pathname === to) return true;
    if (to === "/admin") return false;
    return location.pathname.startsWith(to + "/");
  }

  const activeBranchId = nav.find(
    (entry) => isNavBranch(entry) && entry.groups.some((g) => g.items.some((i) => itemMatchesPath(i.to)))
  ) as { id: string } | undefined;

  const [openBranch, setOpenBranch] = useState<string | null>(
    activeBranchId?.id ?? branchIds[0] ?? null
  );

  useEffect(() => {
    if (activeBranchId) setOpenBranch(activeBranchId.id);
  }, [activeBranchId?.id]);

  function handleLogout() {
    logout();
    navigate("/");
  }

  function closeSidebar() {
    setSidebarOpen(false);
  }

  const initials = userName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div className="app-shell">
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={closeSidebar} />
      )}

      <aside className={`sidebar${collapsed ? " collapsed" : ""}${sidebarOpen ? " mobile-open" : ""}`}>
        <div className={`sidebar-head${collapsed ? " sidebar-head-collapsed" : ""}`}>
          {collapsed ? (
            <img src="/favicon.png" alt="SIM" className="brand-favicon" />
          ) : (
            <img src="/logo_sim.webp" alt="SIM Assurances" className="brand-logo-full" />
          )}
        </div>

        <nav className="nav">
          {nav.map((entry) => {
            if (!isNavBranch(entry)) {
              return (
                <div key={entry.section} onClick={closeSidebar}>
                  {renderGroup(entry, collapsed, homeTo)}
                </div>
              );
            }

            const BranchIcon = entry.icon;
            const isOpen = openBranch === entry.id;
            return (
              <div key={entry.id} className="nav-branch">
                <button
                  type="button"
                  className={`nav-branch-head${isOpen ? " open" : ""}`}
                  title={entry.label}
                  onClick={() => {
                    setOpenBranch(isOpen ? null : entry.id);
                    if (!isOpen) navigate(entry.homeTo);
                  }}
                >
                  <BranchIcon size={19} />
                  {!collapsed && <span className="nav-branch-label">{entry.label}</span>}
                  {!collapsed && (
                    <ChevronDown
                      size={16}
                      className="nav-branch-chevron"
                      style={{ transform: isOpen ? "rotate(180deg)" : undefined }}
                    />
                  )}
                </button>
                {isOpen && (
                  <div className="nav-branch-body" onClick={closeSidebar}>
                    {entry.groups.map((g) => renderGroup(g, collapsed, entry.homeTo))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <button
            className="foot-btn foot-btn-collapse"
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? (
              <ChevronsRight size={19} />
            ) : (
              <ChevronsLeft size={19} />
            )}
            {!collapsed && <span>Réduire</span>}
          </button>
          <button className="foot-btn danger" onClick={handleLogout}>
            <LogOut size={19} />
            {!collapsed && <span>Déconnexion</span>}
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          {/* Bouton hamburger — visible uniquement sur mobile via CSS */}
          <button
            className="icon-btn topbar-menu-btn"
            aria-label="Ouvrir le menu"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={19} />
          </button>
          <div className="topbar-right">
            <NotificationsBell />
            <button
              className="user-chip"
              onClick={() => navigate("profil")}
              title="Mon profil"
              style={{ background: "none", border: "none", cursor: "pointer" }}
            >
              <div className="avatar">{initials}</div>
              <div className="user-meta">
                <div className="user-name">{userName}</div>
                <div className="user-mail">{userMail}</div>
              </div>
            </button>
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
