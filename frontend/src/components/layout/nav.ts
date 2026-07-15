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
  Clock,
  Bike,
  Car,
  IdCard,
  Landmark,
  MapPin,
  Building2,
  Percent,
  CloudRain,
  Calculator,
  LifeBuoy,
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
/** Une branche regroupe plusieurs NavGroup sous un même en-tête cliquable/repliable. */
export interface NavBranch {
  id: string;
  label: string;
  icon: LucideIcon;
  homeTo: string;
  groups: NavGroup[];
}
export type AdminNavEntry = NavGroup | NavBranch;

export function isNavBranch(entry: AdminNavEntry): entry is NavBranch {
  return "groups" in entry;
}

export const adminNav: AdminNavEntry[] = [
  {
    id: "incendie-accident",
    label: "Assurances Accident et Incendie",
    icon: Flame,
    homeTo: "/admin",
    groups: [
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
          { to: "/admin/paiements-en-attente", label: "Paiement en attente", icon: Clock },
          { to: "/admin/contrats", label: "Contrats", icon: FileText },
        ],
      },
      {
        section: "Pilotage",
        items: [
          { to: "/admin/performance", label: "Performance & Commissions", icon: TrendingUp },
        ],
      },
    ],
  },
  {
    id: "relax",
    label: "Assurances RelaxMoto et RelaxAuto",
    icon: Bike,
    homeTo: "/admin/relax",
    groups: [
      {
        section: "Gestion",
        items: [
          { to: "/admin/relax", label: "Tableau de bord", icon: LayoutDashboard },
          { to: "/admin/relax/partenaires", label: "Partenaires", icon: Store },
        ],
      },
      {
        section: "Souscriptions",
        items: [
          { to: "/admin/relax/moto", label: "Clients RelaxMoto", icon: Bike },
          { to: "/admin/relax/auto", label: "Clients RelaxAuto", icon: Car },
          { to: "/admin/relax/paiements-en-attente", label: "Paiement en attente", icon: Clock },
          { to: "/admin/relax/contrats", label: "Contrats & Cartes", icon: IdCard },
        ],
      },
      {
        section: "Pilotage",
        items: [
          { to: "/admin/relax/performance", label: "Performance & Commissions", icon: TrendingUp },
        ],
      },
    ],
  },
  {
    id: "imf",
    label: "Assurances IMF",
    icon: Landmark,
    homeTo: "/admin/imf",
    groups: [
      {
        section: "Réseau",
        items: [
          { to: "/admin/imf", label: "Tableau de bord", icon: LayoutDashboard },
          { to: "/admin/imf/zones", label: "Zones", icon: MapPin },
          { to: "/admin/imf/agences", label: "Agences", icon: Building2 },
          { to: "/admin/imf/agents", label: "Agents", icon: Users },
        ],
      },
      {
        section: "Tarification",
        items: [
          { to: "/admin/imf/baremes", label: "Barèmes", icon: Percent },
          { to: "/admin/imf/indice-arc", label: "Indice ARC", icon: CloudRain },
        ],
      },
      {
        section: "Portefeuille",
        items: [
          { to: "/admin/imf/simulateur", label: "Simulateur", icon: Calculator },
          { to: "/admin/imf/souscriptions", label: "Souscriptions", icon: FileText },
          { to: "/admin/imf/contrats", label: "Contrats", icon: IdCard },
          { to: "/admin/imf/sinistres", label: "Sinistres", icon: LifeBuoy },
        ],
      },
    ],
  },
  {
    section: "Administration générale",
    items: [
      { to: "/admin/journal", label: "Journal d'activité", icon: ScrollText },
      { to: "/admin/administrateurs", label: "Administrateurs", icon: Users },
      { to: "/admin/parametres", label: "Paramètres", icon: Settings },
    ],
  },
];

export type RoleImfNav = "AGENT" | "RESPONSABLE_AGENCE" | "RESPONSABLE_ZONE";

/** Nav de l'espace agent IMF, adaptée selon la portée du rôle connecté. */
export function agentImfNav(roleImf?: RoleImfNav): NavGroup[] {
  const reseau: NavItem[] =
    roleImf === "RESPONSABLE_ZONE"
      ? [{ to: "/agent-imf/reseau-zone", label: "Mon réseau", icon: MapPin }]
      : roleImf === "RESPONSABLE_AGENCE"
      ? [{ to: "/agent-imf/reseau-agence", label: "Mon agence", icon: Building2 }]
      : [];

  return [
    {
      section: "Mon activité",
      items: [
        { to: "/agent-imf", label: "Tableau de bord", icon: LayoutDashboard },
        { to: "/agent-imf/simulateur", label: "Simulateur", icon: Calculator },
        ...reseau,
        { to: "/agent-imf/souscriptions", label: "Souscriptions", icon: FileText },
        { to: "/agent-imf/contrats", label: "Contrats", icon: IdCard },
        { to: "/agent-imf/sinistres", label: "Sinistres", icon: LifeBuoy },
      ],
    },
  ];
}

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
