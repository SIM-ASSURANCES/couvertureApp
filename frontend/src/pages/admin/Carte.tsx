import { useCallback, useEffect, useRef } from "react";
import { Maximize } from "lucide-react";
import { PageHeader } from "../../components/ui";
import { useFetch } from "../../useFetch";

/**
 * Carte interactive de la Côte d'Ivoire (application Next.js de frontend/carte,
 * exportée en statique et servie par nginx sous /carte). Intégrée en iframe :
 * elle garde ses propres styles (Tailwind) sans interférer avec theme.css.
 *
 * Le réseau de distribution (partenaires Accidents & Dommages et leurs
 * sous-agents) est chargé ici, avec la session admin, puis transmis à la carte
 * par postMessage (même origine) : la carte publique /carte n'appelle jamais
 * l'API et n'affiche aucun partenaire. Placement et comptage : voir
 * frontend/carte/src/lib/reseau.ts.
 */
const CARTE_URL = "/carte";

interface AgentCarte {
  id: string;
  nom?: string | null;
  telephone?: string | null;
  localisation: string | null;
  statut: string;
}
interface PartenaireCarte {
  id: string;
  nomCommerce: string;
  nomResponsable: string;
  telephone: string;
  localisation: string | null;
  statut: string;
  agents: AgentCarte[];
}

export default function Carte() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const prete = useRef(false);
  const { data: reseau, error } = useFetch<PartenaireCarte[]>("/partenaires/carte");

  const envoyer = useCallback(() => {
    if (!prete.current || !reseau) return;
    iframeRef.current?.contentWindow?.postMessage({ type: "sim-carte:reseau", partenaires: reseau }, window.location.origin);
  }, [reseau]);

  // La carte annonce qu'elle est prête (à chaque chargement de l'iframe) : on lui envoie le réseau.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== iframeRef.current?.contentWindow) return;
      if ((e.data as { type?: string } | null)?.type === "sim-carte:prete") {
        prete.current = true;
        envoyer();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [envoyer]);

  // Données (re)chargées après que la carte est prête, y compris l'actualisation automatique.
  useEffect(() => envoyer(), [envoyer]);

  return (
    <>
      <PageHeader
        title="Carte interactive"
        subtitle="Partenaires Accidents & Dommages et leurs sous-agents, placés d'après leur localisation."
        actions={
          <button className="btn btn-ghost" onClick={() => iframeRef.current?.requestFullscreen?.()}>
            <Maximize size={16} /> Plein écran
          </button>
        }
      />

      {error && (
        <p style={{ marginTop: 16, marginBottom: 0, color: "var(--danger, #b91c1c)", fontSize: 13 }}>
          Réseau des partenaires indisponible : {error}
        </p>
      )}

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
          ref={iframeRef}
          src={CARTE_URL}
          title="Carte interactive de la Côte d'Ivoire"
          allow="geolocation; clipboard-write; fullscreen"
          allowFullScreen
          style={{ display: "block", width: "100%", height: "100%", border: 0 }}
        />
      </div>
    </>
  );
}
