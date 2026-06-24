import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Bell, ChevronsLeft, ChevronsRight, LogOut, Menu } from "lucide-react";
import type { NavGroup } from "./nav";
import { useAuth } from "../../auth";

interface Props {
  nav: NavGroup[];
  brandName: string;
  brandSub: string;
  userName: string;
  userMail: string;
  homeTo: string;
  children: React.ReactNode;
}

export default function DashboardLayout({
  nav,
  brandName,
  brandSub,
  userName,
  userMail,
  homeTo,
  children,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { logout } = useAuth();

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

        <nav className="nav" onClick={closeSidebar}>
          {nav.map((group) => (
            <div key={group.section}>
              {!collapsed && <div className="nav-section">{group.section}</div>}
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === homeTo}
                    className={({ isActive }) =>
                      `nav-item${isActive ? " active" : ""}`
                    }
                    title={item.label}
                  >
                    <Icon size={19} />
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                );
              })}
            </div>
          ))}
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
            <button className="icon-btn" aria-label="Notifications">
              <Bell size={19} />
              <span className="dot" />
            </button>
            <div className="user-chip">
              <div className="user-meta">
                <div className="user-name">{userName}</div>
                <div className="user-mail">{userMail}</div>
              </div>
              <div className="avatar">{initials}</div>
            </div>
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
