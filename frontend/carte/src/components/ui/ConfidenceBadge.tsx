import { Calculator, CircleAlert, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/cn";
import type { Confidence } from "@/lib/schema/city";

export const CONFIDENCE_META: Record<Confidence, { label: string; description: string; className: string; Icon: typeof ShieldCheck }> = {
  verified: {
    label: "Sourcé",
    description: "Donnée issue d'une source identifiée (voir l'onglet Sources).",
    className: "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
    Icon: ShieldCheck,
  },
  computed: {
    label: "Calculé",
    description: "Valeur calculée automatiquement à partir de données ouvertes (coordonnées OSM, itinéraire OSRM).",
    className: "bg-sky-50 text-sky-800 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20",
    Icon: Calculator,
  },
  "to-verify": {
    label: "À vérifier",
    description: "Contenu éditorial de démonstration, à recouper avec une source officielle avant publication.",
    className: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
    Icon: CircleAlert,
  },
};

export function ConfidenceBadge({ level, compact = false, className }: { level: Confidence; compact?: boolean; className?: string }) {
  const meta = CONFIDENCE_META[level];
  return (
    <span
      title={meta.description}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        meta.className,
        className,
      )}
    >
      <meta.Icon aria-hidden className="size-3" />
      {compact ? <span className="sr-only">{meta.label}</span> : meta.label}
    </span>
  );
}
