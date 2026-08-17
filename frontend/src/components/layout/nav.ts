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
  IdCard,
  Landmark,
  MapPin,
  Building2,
  Percent,
  CloudRain,
  Calculator,
  LifeBuoy,
  Banknote,
  HeartPulse,
  AlertTriangle,
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
    label: "Assurances Accidents et Dommages",
    icon: HeartPulse,
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
          { to: "/admin/incendie", label: "Clients Dommages", icon: Flame },
          { to: "/admin/clients-accidents", label: "Clients Accidents", icon: FileText },
          { to: "/admin/accident", label: "Clients Accident (historique)", icon: ShieldCheck },
          { to: "/admin/paiements-en-attente", label: "Paiement en attente", icon: Clock },
          { to: "/admin/contrats", label: "Contrats", icon: FileText },
          { to: "/admin/sinistres", label: "Sinistres", icon: AlertTriangle },
        ],
      },
      {
        section: "Pilotage",
        items: [
          { to: "/admin/tarifs-accidents", label: "Tarifs", icon: Percent },
          { to: "/admin/performance", label: "Performance & Commissions", icon: TrendingUp },
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
          { to: "/admin/imf/contrats", label: "Contrats", icon: IdCard },
          { to: "/admin/imf/sinistres", label: "Sinistres", icon: LifeBuoy },
          { to: "/admin/imf/bordereaux", label: "Bordereaux", icon: Banknote },
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

export type RoleImfNav = "AGENT" | "RESPONSABLE_AGENCE" | "RESPONSABLE_ZONE" | "CHEF_ZONE" | "FINANCE_COMPTABLE";

/**
 * Nav de l'espace agent IMF, adaptée selon la portée du rôle connecté. Le
 * finance comptable a un accès volontairement restreint : tableau de bord,
 * souscriptions, contrats, finance — ni simulateur, ni sinistres, ni gestion
 * de réseau (cohérent avec le blocage serveur, voir bloquerFinanceComptable
 * côté backend).
 */
export function agentImfNav(roleImf?: RoleImfNav): NavGroup[] {
  if (roleImf === "FINANCE_COMPTABLE") {
    return [
      {
        section: "Mon activité",
        items: [
          { to: "/agent-imf", label: "Tableau de bord", icon: LayoutDashboard },
          { to: "/agent-imf/contrats", label: "Contrats", icon: IdCard },
          { to: "/agent-imf/finance", label: "Finance", icon: Wallet },
        ],
      },
    ];
  }

  const reseau: NavItem[] =
    roleImf === "RESPONSABLE_ZONE" || roleImf === "CHEF_ZONE"
      ? [{ to: "/agent-imf/reseau-zone", label: "Mon réseau", icon: MapPin }]
      : roleImf === "RESPONSABLE_AGENCE"
      ? [{ to: "/agent-imf/reseau-agence", label: "Mon agence", icon: Building2 }]
      : [];

  // Le chef de zone (CHEF_ZONE) supervise la production de son réseau
  // (plusieurs zones) et établit des devis, mais ne traite jamais les
  // sinistres individuellement (voir bloquerSinistres côté backend, qui
  // applique la même restriction). Le responsable de zone (RESPONSABLE_ZONE,
  // une seule zone) garde lui l'accès complet, comme un agent classique.
  return [
    {
      section: "Mon activité",
      items: [
        { to: "/agent-imf", label: "Tableau de bord", icon: LayoutDashboard },
        { to: "/agent-imf/simulateur", label: "Simulateur", icon: Calculator },
        ...reseau,
        { to: "/agent-imf/contrats", label: "Contrats", icon: IdCard },
        ...(roleImf === "CHEF_ZONE" ? [] : [{ to: "/agent-imf/sinistres", label: "Sinistres", icon: LifeBuoy }]),
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
      {
        to: "/partenaire/agents",
        label: "Mes agents",
        icon: Users,
      },
    ],
  },
  {
    section: "Outils",
    items: [{ to: "/partenaire/qr", label: "Mon QR code", icon: QrCode }],
  },
];
