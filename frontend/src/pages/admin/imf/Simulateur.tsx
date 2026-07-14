import Simulateur from "../../agent-imf/Simulateur";

/**
 * Simulateur IMF de l'espace admin : réutilise à l'identique le simulateur de
 * l'agent, mais branché sur les endpoints admin (`/imf/...`). Les souscriptions
 * créées ici sont directes — rattachées à l'admin, sans agent ni zone/agence.
 */
export default function ImfSimulateur() {
  return <Simulateur apiBase="/imf" />;
}
