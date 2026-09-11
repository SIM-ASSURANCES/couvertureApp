import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CitySheet } from "@/components/city/CitySheet";
import { CountryLocator } from "@/components/city/CountryLocator";
import { getCityDetail, getCityIds } from "@/server/cities";

type Props = { params: Promise<{ id: string }> };

// Toutes les fiches sont pré-générées au build (SSG) ; une ville inconnue renvoie une 404.
export const dynamicParams = false;

export async function generateStaticParams() {
  return (await getCityIds()).map((id) => ({ id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const detail = await getCityDetail(id);
  if (!detail) return {};
  const { city, computed } = detail;
  const title = `${city.name} — ${computed.regionName ?? computed.districtFullName}`;
  return {
    title,
    description: city.summary,
    alternates: { canonical: `/ville/${city.id}` },
    openGraph: {
      title,
      description: city.tagline,
      type: "article",
      images: computed.image ? [{ url: computed.image.src, alt: city.name }] : undefined,
    },
  };
}

export default async function CityPage({ params }: Props) {
  const { id } = await params;
  const detail = await getCityDetail(id);
  if (!detail) notFound();
  const { city, computed } = detail;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "City",
    name: city.name,
    description: city.summary,
    geo: {
      "@type": "GeoCoordinates",
      latitude: computed.coordinates.lat,
      longitude: computed.coordinates.lon,
      ...(computed.elevation && { elevation: computed.elevation.value }),
    },
    containedInPlace: {
      "@type": "AdministrativeArea",
      name: computed.districtFullName,
      containedInPlace: { "@type": "Country", name: "Côte d'Ivoire" },
    },
    ...(computed.image && { image: computed.image.src }),
    sameAs: [
      `https://www.openstreetmap.org/${city.refs.osm}`,
      city.refs.wikidata && `https://www.wikidata.org/wiki/${city.refs.wikidata}`,
      computed.wikipedia?.url,
    ].filter(Boolean),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <CitySheet
        detail={detail}
        locator={<CountryLocator lat={computed.coordinates.lat} lon={computed.coordinates.lon} districtId={city.admin.district} name={city.name} />}
      />
    </>
  );
}
