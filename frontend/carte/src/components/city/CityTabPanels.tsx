"use client";

import {
  ArrowUpRight,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  Bus,
  CalendarDays,
  Camera,
  Car,
  Check,
  Clock,
  Coins,
  Compass,
  Copy,
  Drama,
  Factory,
  Fish,
  Gem,
  GraduationCap,
  Hospital,
  Info,
  Landmark,
  Languages,
  Lightbulb,
  MapPin,
  MapPinned,
  Navigation,
  Palette,
  Plane,
  Route,
  School,
  Ship,
  ShieldCheck,
  Store,
  Sun,
  TrainFront,
  TreePalm,
  Users,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useExplorer } from "@/components/explorer/ExplorerProvider";
import { CONFIDENCE_META, ConfidenceBadge } from "@/components/ui/ConfidenceBadge";
import { InfoRow, ItemList, NotAvailable, SectionCard, SubHeading } from "@/components/ui/primitives";
import { COUNTRY_PRACTICAL } from "@/data/country";
import { resolveSource } from "@/data/sources";
import { formatCompact, formatDate, formatDuration, formatKm, formatNumber } from "@/lib/format";
import { directionPhrase, formatCoordinates } from "@/lib/geo";
import type { Confidence, EconomyCategory } from "@/lib/schema/city";
import type { CityDetail } from "@/lib/types";

type TabProps = { detail: CityDetail };

/** Rappel du niveau de fiabilité d'une rubrique entière. */
function TabStatus({ confidence }: { confidence: Confidence }) {
  return (
    <p className="flex items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
      Fiabilité de la rubrique
      <ConfidenceBadge level={confidence} />
    </p>
  );
}

function CopyCoordinates({ lat, lon }: { lat: number; lon: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${lat}, ${lon}`);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {}
      }}
      aria-label={copied ? "Coordonnées copiées" : "Copier les coordonnées"}
      className="ml-1.5 inline-grid size-6 place-items-center rounded-md align-middle text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
    >
      {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
    </button>
  );
}

// ─── Aperçu ──────────────────────────────────────────────────────────────────
export function OverviewTab({ detail: { city, computed }, locator }: TabProps & { locator: React.ReactNode }) {
  const pop = city.population;
  const { lat, lon } = computed.coordinates;
  return (
    <>
      <p className="text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">{city.summary}</p>

      <SectionCard title="Informations générales" icon={Info} confidence={city.admin.confidence}>
        <dl>
          <InfoRow label="District">{computed.districtFullName}</InfoRow>
          <InfoRow label="Région">{computed.regionName ?? "— (district autonome)"}</InfoRow>
          <InfoRow label="Département">{city.admin.department}</InfoRow>
          {city.admin.subPrefecture && <InfoRow label="Sous-préfecture">{city.admin.subPrefecture}</InfoRow>}
          <InfoRow label="Statut">{city.admin.status.join(" · ")}</InfoRow>
        </dl>
      </SectionCard>

      <SectionCard title="Population et superficie" icon={Users} confidence={pop?.confidence ?? "to-verify"}>
        <dl>
          <InfoRow label="Population" hint={pop ? `${pop.scope} · ${resolveSource(pop.source)?.title.split(" — ")[0] ?? "source"}` : undefined}>
            {pop ? `${formatNumber(pop.value)} hab. (${pop.year})` : <NotAvailable />}
          </InfoRow>
          <InfoRow
            label="Superficie"
            hint={
              city.area && (
                <span className="inline-flex items-center gap-1.5">
                  {city.area.scope} <ConfidenceBadge level={city.area.confidence} />
                </span>
              )
            }
          >
            {city.area ? `${formatNumber(city.area.value)} km²` : <NotAvailable />}
          </InfoRow>
        </dl>
        {(pop?.note || city.area?.note) && (
          <p className="mt-2 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            {[pop?.note, city.area?.note].filter(Boolean).join(" ")}
          </p>
        )}
      </SectionCard>

      <SectionCard title="Localisation" icon={MapPinned} confidence="computed">
        <div className="flex items-center gap-4">
          <div className="w-28 shrink-0">{locator}</div>
          <dl className="min-w-0 flex-1 space-y-2 text-sm">
            <div>
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">Coordonnées GPS</dt>
              <dd className="font-medium tabular-nums">
                {formatCoordinates(lat, lon)}
                <CopyCoordinates lat={lat} lon={lon} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">Situation</dt>
              <dd className="font-medium">
                {computed.fromAbidjan
                  ? `${formatKm(computed.fromAbidjan.straightKm)} ${directionPhrase(computed.fromAbidjan.direction)} d'Abidjan`
                  : "Capitale économique, référence des distances"}
              </dd>
            </div>
          </dl>
        </div>
      </SectionCard>

      {city.culture.sites.length > 0 && (
        <SectionCard title="À découvrir" icon={Camera} confidence={city.culture.confidence}>
          <ItemList items={city.culture.sites.slice(0, 4)} variant="chips" sectionConfidence={city.culture.confidence} />
        </SectionCard>
      )}
    </>
  );
}

// ─── Géographie ─────────────────────────────────────────────────────────────
export function GeographyTab({ detail: { city, computed } }: TabProps) {
  const { mapApi, setActiveLocality, setSheetSnap } = useExplorer();
  const g = city.geography;
  const from = computed.fromAbidjan;
  return (
    <>
      <SectionCard title="Situation géographique" icon={Compass} confidence={g.confidence}>
        <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{g.situation}</p>
        {g.relief && (
          <>
            <SubHeading>Relief</SubHeading>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{g.relief}</p>
          </>
        )}
        {g.hydrography.length > 0 && (
          <>
            <SubHeading>Hydrographie</SubHeading>
            <ItemList items={g.hydrography} variant="chips" sectionConfidence={g.confidence} />
          </>
        )}
        {g.landmarks.length > 0 && (
          <>
            <SubHeading>Repères</SubHeading>
            <ItemList items={g.landmarks} variant="chips" sectionConfidence={g.confidence} />
          </>
        )}
      </SectionCard>

      <SectionCard title="Position" icon={MapPin} confidence="computed">
        <dl>
          <InfoRow label="Coordonnées GPS" hint="OpenStreetMap">
            <span className="tabular-nums">{formatCoordinates(computed.coordinates.lat, computed.coordinates.lon)}</span>
          </InfoRow>
          <InfoRow label="Altitude" hint={computed.elevation ? "Wikidata" : undefined}>
            {computed.elevation ? `${formatNumber(computed.elevation.value)} m` : <NotAvailable />}
          </InfoRow>
          {from ? (
            <>
              <InfoRow label="Depuis Abidjan" hint="À vol d'oiseau">
                {formatKm(from.straightKm)} {directionPhrase(from.direction)}
              </InfoRow>
              {from.road && (
                <InfoRow label="Par la route" hint={`≈ ${formatDuration(from.road.durationMin)} · estimation OSRM`}>
                  {formatKm(from.road.distanceKm)}
                </InfoRow>
              )}
            </>
          ) : (
            <InfoRow label="Distances">Ville de référence</InfoRow>
          )}
        </dl>
      </SectionCard>

      <SectionCard title="Villes voisines" icon={Navigation} confidence="computed">
        {computed.nearby.length ? (
          <ul>
            {computed.nearby.map((n) => {
              const label = (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{n.name}</span>
                  {n.population && <span className="text-xs tabular-nums text-zinc-400">{formatCompact(n.population)} hab.</span>}
                  <span className="w-24 shrink-0 text-right text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    {formatKm(n.distanceKm)} · {n.direction}
                  </span>
                </>
              );
              const cls =
                "flex w-full items-center gap-3 border-b border-zinc-900/5 py-2.5 text-left last:border-0 hover:text-accent-700 dark:border-white/5 dark:hover:text-accent-400";
              return (
                <li key={n.name}>
                  {n.cityId ? (
                    <Link href={`/ville/${n.cityId}`} scroll={false} className={cls}>
                      {label}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className={cls}
                      onClick={() => {
                        if (n.locality) setActiveLocality({ ...n.locality, coordinates: n.coordinates });
                        setSheetSnap("peek");
                        mapApi?.flyTo(n.coordinates, 11);
                      }}
                    >
                      {label}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <NotAvailable />
        )}
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Distances à vol d&apos;oiseau vers les localités OpenStreetMap les plus proches.</p>
      </SectionCard>

      <SectionCard title="Principaux axes routiers" icon={Route} confidence={city.transport.confidence}>
        <ItemList items={city.transport.roads} sectionConfidence={city.transport.confidence} />
      </SectionCard>
    </>
  );
}

// ─── Économie ───────────────────────────────────────────────────────────────
const ECONOMY_META: Record<EconomyCategory, { label: string; icon: LucideIcon }> = {
  agriculture: { label: "Agriculture", icon: Wheat },
  trade: { label: "Commerce", icon: Store },
  industry: { label: "Industrie", icon: Factory },
  logistics: { label: "Logistique et transport", icon: Ship },
  services: { label: "Services", icon: BriefcaseBusiness },
  tourism: { label: "Tourisme", icon: TreePalm },
  resources: { label: "Ressources naturelles", icon: Gem },
  crafts: { label: "Artisanat", icon: Palette },
  fishing: { label: "Pêche", icon: Fish },
};
const ECONOMY_REQUIRED: EconomyCategory[] = ["agriculture", "trade", "industry", "tourism", "resources"];

export function EconomyTab({ detail: { city } }: TabProps) {
  const e = city.economy;
  const byCategory = new Map(e.sectors.map((s) => [s.category, s.items]));
  const order = [...e.sectors.map((s) => s.category), ...ECONOMY_REQUIRED.filter((c) => !byCategory.has(c))];
  return (
    <>
      <TabStatus confidence={e.confidence} />
      <SectionCard title="Vue d'ensemble" icon={BriefcaseBusiness}>
        <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{e.summary}</p>
        <SubHeading>Principaux secteurs</SubHeading>
        <ul className="flex flex-wrap gap-1.5">
          {e.sectors.map(({ category }) => {
            const { label, icon: Icon } = ECONOMY_META[category];
            return (
              <li
                key={category}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-sm ring-1 ring-zinc-900/10 dark:bg-zinc-900 dark:ring-white/10"
              >
                <Icon aria-hidden className="size-3.5 text-accent-600 dark:text-accent-400" />
                {label}
              </li>
            );
          })}
        </ul>
      </SectionCard>
      {order.map((category) => (
        <SectionCard key={category} title={ECONOMY_META[category].label} icon={ECONOMY_META[category].icon}>
          <ItemList items={byCategory.get(category) ?? []} sectionConfidence={e.confidence} />
        </SectionCard>
      ))}
    </>
  );
}

// ─── Culture et tourisme ───────────────────────────────────────────────────
export function CultureTab({ detail: { city } }: TabProps) {
  const c = city.culture;
  return (
    <>
      <TabStatus confidence={c.confidence} />
      <SectionCard title="Sites et attractions" icon={Camera}>
        <ItemList items={c.sites} sectionConfidence={c.confidence} />
      </SectionCard>
      <SectionCard title="Patrimoine et monuments" icon={Landmark}>
        <ItemList items={c.heritage} sectionConfidence={c.confidence} />
      </SectionCard>
      <SectionCard title="Festivals et événements" icon={CalendarDays}>
        <ItemList items={c.events} sectionConfidence={c.confidence} />
      </SectionCard>
      <SectionCard title="Traditions locales" icon={Drama}>
        <ItemList items={c.traditions} variant="chips" sectionConfidence={c.confidence} />
      </SectionCard>
    </>
  );
}

// ─── Services et infrastructures ──────────────────────────────────────────
export function ServicesTab({ detail: { city } }: TabProps) {
  const s = city.services;
  const t = city.transport;
  return (
    <>
      <TabStatus confidence={s.confidence} />
      <SectionCard title="Santé" icon={Hospital}>
        <ItemList items={s.health} sectionConfidence={s.confidence} />
      </SectionCard>
      <SectionCard title="Enseignement" icon={School}>
        <ItemList items={s.education} sectionConfidence={s.confidence} />
      </SectionCard>
      <SectionCard title="Enseignement supérieur" icon={GraduationCap}>
        <ItemList items={s.higherEducation} sectionConfidence={s.confidence} />
      </SectionCard>
      <SectionCard title="Aéroports et gares" icon={Plane}>
        <ItemList items={[...t.airports, ...t.railways]} sectionConfidence={s.confidence} />
      </SectionCard>
      <SectionCard title="Infrastructures" icon={Building2}>
        <ItemList items={s.infrastructure} sectionConfidence={s.confidence} />
      </SectionCard>
      <SectionCard title="Services publics" icon={Landmark}>
        <ItemList items={s.publicServices} sectionConfidence={s.confidence} />
      </SectionCard>
    </>
  );
}

// ─── Transport ──────────────────────────────────────────────────────────────
export function TransportTab({ detail: { city, computed } }: TabProps) {
  const t = city.transport;
  const from = computed.fromAbidjan;
  return (
    <>
      <SectionCard title="Distance et temps de trajet" icon={Car} confidence="computed">
        {from ? (
          <>
            <dl>
              <InfoRow label="Par la route">{from.road ? formatKm(from.road.distanceKm) : <NotAvailable />}</InfoRow>
              <InfoRow label="Durée estimée">{from.road ? formatDuration(from.road.durationMin) : <NotAvailable />}</InfoRow>
              <InfoRow label="À vol d'oiseau">{formatKm(from.straightKm)}</InfoRow>
            </dl>
            {from.road && (
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Itinéraire calculé depuis Abidjan par OSRM sur les données OpenStreetMap, le {formatDate(from.road.computedAt)}. Durée
                indicative, hors trafic et arrêts.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">Abidjan sert de point de référence pour les distances et temps de trajet des autres fiches.</p>
        )}
      </SectionCard>
      <TabStatus confidence={t.confidence} />
      <SectionCard title="Routes principales" icon={Route}>
        <ItemList items={t.roads} sectionConfidence={t.confidence} />
      </SectionCard>
      <SectionCard title="Moyens de transport" icon={Bus}>
        <ItemList items={t.modes} variant="chips" sectionConfidence={t.confidence} />
      </SectionCard>
      <SectionCard title="Aéroports" icon={Plane}>
        <ItemList items={t.airports} sectionConfidence={t.confidence} empty="Pas d'aéroport renseigné" />
      </SectionCard>
      <SectionCard title="Gares" icon={TrainFront}>
        <ItemList items={t.railways} sectionConfidence={t.confidence} empty="Pas de gare renseignée" />
      </SectionCard>
      {t.ports.length > 0 && (
        <SectionCard title="Ports" icon={Ship}>
          <ItemList items={t.ports} sectionConfidence={t.confidence} />
        </SectionCard>
      )}
    </>
  );
}

// ─── Informations pratiques ────────────────────────────────────────────────
export function PracticalTab({ detail: { city } }: TabProps) {
  const p = city.practical;
  const cp = COUNTRY_PRACTICAL;
  return (
    <>
      <TabStatus confidence={p.confidence} />
      <SectionCard title="Climat" icon={Sun}>
        <dl>
          <InfoRow label="Type">{p.climate.type}</InfoRow>
          {p.climate.koppen && <InfoRow label="Classification de Köppen">{p.climate.koppen}</InfoRow>}
        </dl>
        {p.climate.seasons.length > 0 && (
          <>
            <SubHeading>Saisons</SubHeading>
            <ItemList items={p.climate.seasons} sectionConfidence={p.confidence} />
          </>
        )}
      </SectionCard>
      <SectionCard title="Langues" icon={Languages}>
        <ItemList items={p.languages.map((name) => ({ name }))} variant="chips" />
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Langue officielle : {cp.officialLanguage.toLowerCase()}.</p>
      </SectionCard>
      <SectionCard title="Repères pratiques" icon={Coins} confidence="verified">
        <dl>
          <InfoRow label="Devise" hint={resolveSource(cp.currency.source)?.publisher}>
            {cp.currency.label} ({cp.currency.code})
          </InfoRow>
          <InfoRow label="Indicatif" hint={cp.callingCode.hint}>
            {cp.callingCode.label}
          </InfoRow>
          <InfoRow label="Fuseau horaire" hint={cp.timezone.hint}>
            {cp.timezone.label}
          </InfoRow>
          <InfoRow label="Circulation">{cp.driving}</InfoRow>
        </dl>
      </SectionCard>
      <SectionCard title="Conseils aux visiteurs" icon={Lightbulb}>
        <ItemList items={p.tips} sectionConfidence={p.confidence} />
      </SectionCard>
    </>
  );
}

// ─── Sources ────────────────────────────────────────────────────────────────
export function SourcesTab({ detail: { city, computed } }: TabProps) {
  const img = computed.image;
  return (
    <>
      <SectionCard title="Fiabilité des informations" icon={ShieldCheck}>
        <ul className="space-y-3">
          {(Object.keys(CONFIDENCE_META) as Confidence[]).map((level) => (
            <li key={level} className="flex items-start gap-3">
              <ConfidenceBadge level={level} className="mt-0.5 w-24 justify-center" />
              <span className="text-sm text-zinc-600 dark:text-zinc-300">{CONFIDENCE_META[level].description}</span>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Sources de la fiche" icon={BookOpen}>
        <ol className="space-y-3">
          {computed.sources.map((s) => (
            <li key={s.id} className="text-sm">
              {s.url ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 font-medium hover:text-accent-700 hover:underline dark:hover:text-accent-400">
                  {s.title}
                  <ArrowUpRight aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                </a>
              ) : (
                <span className="font-medium">{s.title}</span>
              )}
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                {[s.publisher, s.date && formatDate(s.date), s.license].filter(Boolean).join(" · ")}
              </span>
            </li>
          ))}
        </ol>
      </SectionCard>

      {img && (
        <SectionCard title="Crédit photo" icon={Camera}>
          <p className="text-sm">
            <a href={img.pageUrl} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
              {img.title}
            </a>
            <span className="block text-xs text-zinc-500 dark:text-zinc-400">
              {img.author} ·{" "}
              {img.licenseUrl ? (
                <a href={img.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline">
                  {img.license}
                </a>
              ) : (
                img.license
              )}{" "}
              · Wikimedia Commons
            </span>
          </p>
        </SectionCard>
      )}

      <SectionCard title="Mises à jour" icon={Clock}>
        <dl>
          <InfoRow label="Contenu éditorial">{formatDate(city.updatedAt)}</InfoRow>
          <InfoRow label="Données générées">{formatDate(computed.generatedAt)}</InfoRow>
        </dl>
      </SectionCard>
    </>
  );
}
