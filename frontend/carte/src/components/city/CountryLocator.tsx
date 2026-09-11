import outline from "@/data/generated/country-outline.json";

/**
 * Mini-carte SVG (rendue côté serveur) situant la ville dans le pays et mettant en avant son district.
 * Les tracés sont pré-projetés par scripts/fetch-boundaries.mjs.
 */
export function CountryLocator({ lat, lon, districtId, name }: { lat: number; lon: number; districtId: string; name: string }) {
  const [minX, , , maxY] = outline.bbox as [number, number, number, number];
  const x = (lon - minX) * outline.k * outline.scale;
  const y = (maxY - lat) * outline.scale;
  return (
    <svg viewBox={`-4 -4 ${outline.width + 8} ${outline.height + 8}`} role="img" aria-label={`Position de ${name} en Côte d'Ivoire`} className="h-auto w-full">
      <path d={outline.country} className="fill-white stroke-zinc-400 dark:fill-zinc-900 dark:stroke-zinc-500" strokeWidth={1} strokeLinejoin="round" />
      {outline.districts.map((d) => (
        <path
          key={d.id}
          d={d.path}
          strokeWidth={d.id === districtId ? 1.2 : 0.5}
          strokeLinejoin="round"
          className={
            d.id === districtId ? "fill-accent-400/25 stroke-accent-700 dark:stroke-accent-400" : "fill-none stroke-zinc-300 dark:stroke-zinc-700"
          }
        />
      ))}
      <circle cx={x} cy={y} r={10} className="fill-accent-400/30" />
      <circle cx={x} cy={y} r={4.5} className="fill-accent-700 stroke-white dark:fill-accent-400 dark:stroke-zinc-900" strokeWidth={1.8} />
    </svg>
  );
}
