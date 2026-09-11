import { ExternalLink } from "lucide-react";
import { PageHeader } from "../../components/ui";

/**
 * Carte interactive de la Côte d'Ivoire (application Next.js de frontend/carte,
 * exportée en statique et servie par nginx sous /carte). Intégrée en iframe :
 * elle garde ses propres styles (Tailwind) sans interférer avec theme.css.
 */
const CARTE_URL = "/carte";

export default function Carte() {
  return (
    <>
      <PageHeader
        title="Carte interactive"
        subtitle="Explorez les villes, districts et localités de Côte d'Ivoire."
        actions={
          <a className="btn btn-ghost" href={CARTE_URL} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} /> Plein écran
          </a>
        }
      />

      <div
        style={{
          marginTop: 24,
          height: "calc(100dvh - 230px)",
          minHeight: 480,
          borderRadius: 16,
          overflow: "hidden",
          border: "1px solid var(--border)",
          background: "var(--card)",
        }}
      >
        <iframe
          src={CARTE_URL}
          title="Carte interactive de la Côte d'Ivoire"
          allow="geolocation; clipboard-write"
          style={{ display: "block", width: "100%", height: "100%", border: 0 }}
        />
      </div>
    </>
  );
}
