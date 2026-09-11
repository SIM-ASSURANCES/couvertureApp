"use client";

import {
  ArrowUpRight,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  Check,
  Crosshair,
  Info,
  Landmark,
  LayoutGrid,
  Mountain,
  Navigation,
  Route,
  Ruler,
  Share2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  CultureTab,
  EconomyTab,
  GeographyTab,
  OverviewTab,
  PracticalTab,
  ServicesTab,
  SourcesTab,
  TransportTab,
} from "@/components/city/CityTabPanels";
import { useExplorer } from "@/components/explorer/ExplorerProvider";
import { ConfidenceBadge } from "@/components/ui/ConfidenceBadge";
import { NotAvailable, StatTile } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { formatDuration, formatKm, formatNumber } from "@/lib/format";
import { CITY_ZOOM } from "@/lib/map/config";
import type { CityDetail } from "@/lib/types";

const TABS = [
  { id: "apercu", label: "Aperçu", icon: LayoutGrid },
  { id: "geographie", label: "Géographie", icon: Mountain },
  { id: "economie", label: "Économie", icon: BriefcaseBusiness },
  { id: "culture", label: "Culture", icon: Landmark },
  { id: "services", label: "Services", icon: Building2 },
  { id: "transport", label: "Transport", icon: Route },
  { id: "pratique", label: "Pratique", icon: Info },
  { id: "sources", label: "Sources", icon: BookOpen },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[];
type TabId = (typeof TABS)[number]["id"];
const isTab = (v: string): v is TabId => TABS.some((t) => t.id === v);

/** Fiche détaillée d'une ville : en-tête, actions, chiffres clés et rubriques à onglets. */
export function CitySheet({ detail, locator }: { detail: CityDetail; locator: React.ReactNode }) {
  const { city, computed } = detail;
  const [tab, setTab] = useState<TabId>("apercu");
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabButtons = useRef<Map<TabId, HTMLButtonElement>>(new Map());

  // À l'ouverture d'une fiche : retour en haut, focus sur le titre, onglet éventuel depuis l'URL (#economie).
  useEffect(() => {
    rootRef.current?.closest("[data-panel-scroll]")?.scrollTo({ top: 0 });
    titleRef.current?.focus({ preventScroll: true });
    const hash = window.location.hash.slice(1);
    if (isTab(hash)) setTab(hash);
  }, [city.id]);

  const selectTab = (id: TabId, focus = false) => {
    setTab(id);
    window.history.replaceState(null, "", id === "apercu" ? window.location.pathname : `#${id}`);
    // Amène la barre d'onglets en haut du panneau pour que le contenu choisi soit visible.
    const scroller = rootRef.current?.closest("[data-panel-scroll]");
    const tabsTop = tabsRef.current?.offsetTop ?? 0;
    if (scroller && Math.abs(scroller.scrollTop - tabsTop) > 4) scroller.scrollTo({ top: tabsTop, behavior: "smooth" });
    const btn = tabButtons.current.get(id);
    btn?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (focus) btn?.focus();
  };

  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next =
      e.key === "ArrowRight" ? (i + 1) % TABS.length : e.key === "ArrowLeft" ? (i - 1 + TABS.length) % TABS.length : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    selectTab(TABS[next]!.id, true);
  };

  const road = computed.fromAbidjan?.road;

  return (
    <article ref={rootRef} aria-labelledby="city-title" className="animate-fade-in">
      <CityHero detail={detail} />

      <div className="px-5 pt-4">
        <nav aria-label="Rattachement administratif" className="flex flex-wrap items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span>{computed.districtName}</span>
          {computed.regionName && (
            <>
              <span aria-hidden>›</span>
              <span>{computed.regionName}</span>
            </>
          )}
          <span aria-hidden>›</span>
          <span>Dép. {city.admin.department}</span>
        </nav>
        <h1 id="city-title" ref={titleRef} tabIndex={-1} className="mt-1 text-[26px] font-semibold leading-tight tracking-tight focus:outline-none">
          {city.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{city.tagline}</p>
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Statut administratif">
          {city.admin.status.map((s) => (
            <li key={s} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {s}
            </li>
          ))}
        </ul>

        <CityActions detail={detail} />

        <div className="mt-4 grid grid-cols-2 gap-2">
          <StatTile
            icon={Users}
            label="Population"
            value={city.population ? formatNumber(city.population.value) : <NotAvailable />}
            hint={city.population ? `Recensement ${city.population.year}` : undefined}
            badge={city.population && <ConfidenceBadge level={city.population.confidence} compact />}
          />
          <StatTile
            icon={Navigation}
            label="Depuis Abidjan"
            value={road ? formatKm(road.distanceKm) : computed.fromAbidjan ? formatKm(computed.fromAbidjan.straightKm) : "—"}
            hint={road ? `≈ ${formatDuration(road.durationMin)} par la route` : computed.fromAbidjan ? "à vol d'oiseau" : "Ville de référence"}
            badge={computed.fromAbidjan && <ConfidenceBadge level="computed" compact />}
          />
          <StatTile
            icon={Mountain}
            label="Altitude"
            value={computed.elevation ? `${formatNumber(computed.elevation.value)} m` : <NotAvailable label="Non disponible" />}
            hint={computed.elevation ? "Wikidata" : undefined}
          />
          <StatTile
            icon={Ruler}
            label="Superficie"
            value={city.area ? `${formatNumber(city.area.value)} km²` : <NotAvailable label="Non disponible" />}
            hint={city.area?.scope}
            badge={city.area && <ConfidenceBadge level={city.area.confidence} compact />}
          />
        </div>
      </div>

      <div ref={tabsRef} className="sticky top-0 z-10 mt-5 border-b border-zinc-900/5 bg-white/95 backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/95">
        <div role="tablist" aria-label="Rubriques de la fiche" onKeyDown={onTabKey} className="no-scrollbar flex gap-0.5 overflow-x-auto px-3">
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  if (el) tabButtons.current.set(t.id, el);
                }}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={active}
                aria-controls={`panel-${t.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => selectTab(t.id)}
                className={cn(
                  "relative flex shrink-0 items-center gap-1.5 px-2.5 py-3 text-sm font-medium transition-colors",
                  active ? "text-zinc-900 dark:text-white" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
                )}
              >
                <t.icon aria-hidden className="size-4" />
                {t.label}
                {active && <span aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent-700 dark:bg-accent-400" />}
              </button>
            );
          })}
        </div>
      </div>

      <div key={tab} role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0} className="space-y-3 px-5 pb-12 pt-4 animate-fade-in focus:outline-none">
        {tab === "apercu" && <OverviewTab detail={detail} locator={locator} />}
        {tab === "geographie" && <GeographyTab detail={detail} />}
        {tab === "economie" && <EconomyTab detail={detail} />}
        {tab === "culture" && <CultureTab detail={detail} />}
        {tab === "services" && <ServicesTab detail={detail} />}
        {tab === "transport" && <TransportTab detail={detail} />}
        {tab === "pratique" && <PracticalTab detail={detail} />}
        {tab === "sources" && <SourcesTab detail={detail} />}
      </div>
    </article>
  );
}

function CityHero({ detail: { city, computed } }: { detail: CityDetail }) {
  const img = computed.image;
  return (
    <div className="relative">
      {img ? (
        <figure className="relative h-36 overflow-hidden bg-zinc-200 md:h-44 dark:bg-zinc-800">
          {/* Image Wikimedia Commons déjà redimensionnée (960 px) : pas d'optimiseur nécessaire. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.src} alt={`${city.name} — ${img.title}`} className="size-full object-cover" decoding="async" />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />
          <figcaption className="absolute bottom-1.5 left-3 right-14 truncate text-[10px] text-white/85">
            <a href={img.pageUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
              Photo : {img.author} · {img.license}
            </a>
          </figcaption>
        </figure>
      ) : (
        <div aria-hidden className="brand-band h-20" />
      )}
      <Link
        href="/"
        scroll={false}
        aria-label="Fermer la fiche et revenir à la carte"
        className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65"
      >
        <X className="size-[18px]" />
      </Link>
    </div>
  );
}

function CityActions({ detail: { city, computed } }: { detail: CityDetail }) {
  const { mapApi, setSheetSnap, cityById } = useExplorer();
  const [copied, setCopied] = useState(false);
  const { lat, lon } = computed.coordinates;
  const origin = cityById.get("abidjan");

  const share = async () => {
    const url = `${window.location.origin}/ville/${city.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${city.name} — Atlas CI`, text: city.tagline, url });
      } catch {}
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const directions =
    origin && origin.id !== city.id
      ? `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${origin.coordinates[1]}%2C${origin.coordinates[0]}%3B${lat}%2C${lon}`
      : `https://www.openstreetmap.org/${city.refs.osm}`;

  const secondary =
    "inline-flex h-9 items-center gap-1.5 rounded-full bg-zinc-100 px-3.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-200 active:scale-[0.98] dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700";

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => {
          mapApi?.flyTo([lon, lat], CITY_ZOOM);
          setSheetSnap("peek");
        }}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent-700 px-3.5 text-sm font-medium text-white transition hover:bg-accent-800 active:scale-[0.98]"
      >
        <Crosshair className="size-4" aria-hidden /> Centrer
      </button>
      <button type="button" onClick={share} className={secondary} aria-live="polite">
        {copied ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
        {copied ? "Lien copié" : "Partager"}
      </button>
      <a href={directions} target="_blank" rel="noopener noreferrer" className={secondary}>
        <Route className="size-4" aria-hidden /> {origin && origin.id !== city.id ? "Itinéraire" : "OpenStreetMap"}
      </a>
      {computed.wikipedia && (
        <a href={computed.wikipedia.url} target="_blank" rel="noopener noreferrer" className={secondary}>
          Wikipédia <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
      )}
    </div>
  );
}
