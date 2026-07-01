import {
  LayoutDashboard,
  Store,
  Flame,
  ShieldCheck,
  TrendingUp,
  ScrollText,
  Users,
  Settings,
  QrCode,
  Wallet,
  FileText,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}
export interface NavGroup {
  section: string;
  items: NavItem[];
}

export const adminNav: NavGroup[] = [
  {
    section: "Gestion",
    items: [
      { to: "/admin", label: "Tableau de bord", icon: LayoutDashboard },
      { to: "/admin/partenaires", label: "Partenaires", icon: Store },
    ],
  },
  {
    section: "Souscriptions",
    items: [
      { to: "/admin/incendie", label: "Clients Incendie", icon: Flame },
      { to: "/admin/accident", label: "Clients Accident", icon: ShieldCheck },
      { to: "/admin/contrats", label: "Contrats", icon: FileText },
    ],
  },
  {
    section: "Pilotage",
    items: [
      {
        to: "/admin/performance",
        label: "Performance & Commissions",
        icon: TrendingUp,
      },
      { to: "/admin/journal", label: "Journal d'activité", icon: ScrollText },
    ],
  },
  {
    section: "Administration",
    items: [
      { to: "/admin/administrateurs", label: "Administrateurs", icon: Users },
      { to: "/admin/parametres", label: "Paramètres", icon: Settings },
    ],
  },
];

export const partenaireNav: NavGroup[] = [
  {
    section: "Mon activité",
    items: [
      { to: "/partenaire", label: "Tableau de bord", icon: LayoutDashboard },
      {
        to: "/partenaire/souscriptions",
        label: "Mes souscriptions",
        icon: FileText,
      },
      {
        to: "/partenaire/commissions",
        label: "Mes commissions",
        icon: Wallet,
      },
    ],
  },
  {
    section: "Outils",
    items: [{ to: "/partenaire/qr", label: "Mon QR code", icon: QrCode }],
  },
];
