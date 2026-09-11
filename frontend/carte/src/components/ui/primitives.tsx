import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";

import { ConfidenceBadge } from "@/components/ui/ConfidenceBadge";
import { resolveSource } from "@/data/sources";
import { cn } from "@/lib/cn";
import type { Confidence, InfoItem } from "@/lib/schema/city";

export function NotAvailable({ label = "Information non disponible" }: { label?: string }) {
  return <span className="text-sm italic text-zinc-400 dark:text-zinc-500">{label}</span>;
}

/** Bloc de rubrique : titre, icône et niveau de fiabilité. */
export function SectionCard({
  title,
  icon: Icon,
  confidence,
  children,
  className,
}: {
  title: string;
  icon?: LucideIcon;
  confidence?: Confidence;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-900/5 dark:bg-zinc-800/40 dark:ring-white/5", className)}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {Icon && <Icon aria-hidden className="size-4 text-accent-600 dark:text-accent-400" />}
          {title}
        </h3>
        {confidence && <ConfidenceBadge level={confidence} />}
      </header>
      {children}
    </section>
  );
}

/** Ligne libellé / valeur. */
export function InfoRow({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-zinc-900/5 py-2.5 last:border-0 dark:border-white/5">
      <dt className="shrink-0 text-sm text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {children}
        {hint && <div className="mt-0.5 text-xs font-normal text-zinc-500 dark:text-zinc-400">{hint}</div>}
      </dd>
    </div>
  );
}

function ItemExtras({ item, sectionConfidence }: { item: InfoItem; sectionConfidence?: Confidence }) {
  const source = item.source ? resolveSource(item.source) : undefined;
  const showBadge = item.confidence && item.confidence !== sectionConfidence;
  if (!showBadge && !source && !item.url) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5">
      {showBadge && <ConfidenceBadge level={item.confidence!} />}
      {(item.url ?? source?.url) && (
        <a
          href={item.url ?? source?.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-xs text-zinc-500 underline-offset-2 hover:text-accent-700 hover:underline dark:text-zinc-400 dark:hover:text-accent-400"
        >
          {source ? source.publisher : "Site officiel"}
          <ArrowUpRight aria-hidden className="size-3" />
        </a>
      )}
    </span>
  );
}

/** Liste d'éléments courts ; « chips » pour les mots-clés, « list » pour les éléments détaillés. */
export function ItemList({
  items,
  variant = "list",
  sectionConfidence,
  empty,
}: {
  items: InfoItem[];
  variant?: "list" | "chips";
  sectionConfidence?: Confidence;
  empty?: string;
}) {
  if (!items.length) return <NotAvailable label={empty} />;
  const hasDetails = items.some((i) => i.detail || i.source || i.url || (i.confidence && i.confidence !== sectionConfidence));
  if (variant === "chips" && !hasDetails) {
    return (
      <ul className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li
            key={item.name}
            className="rounded-full bg-white px-3 py-1 text-sm text-zinc-700 ring-1 ring-zinc-900/10 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-white/10"
          >
            {item.name}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.name} className="flex gap-2.5">
          <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent-500/70" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-zinc-800 dark:text-zinc-100">{item.name}</span>
            {item.detail && <span className="block text-sm text-zinc-500 dark:text-zinc-400">{item.detail}</span>}
            <ItemExtras item={item} sectionConfidence={sectionConfidence} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SubHeading({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-400 first:mt-0 dark:text-zinc-500">{children}</h4>;
}

/** Tuile de statistique clé. */
export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  badge,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-900/5 dark:bg-zinc-800/50 dark:ring-white/5">
      <div className="flex items-center justify-between gap-1">
        <span className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <Icon aria-hidden className="size-3.5" />
          {label}
        </span>
        {badge}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-white">{value}</div>
      {hint && <div className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</div>}
    </div>
  );
}
