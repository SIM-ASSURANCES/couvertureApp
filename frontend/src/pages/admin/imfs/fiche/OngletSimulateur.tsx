import Simulateur from "../../../agent-imf/Simulateur";

/**
 * Onglet « Simulateur » de la fiche IMF (phase 3b) — réutilise le composant
 * Simulateur partagé, branché sur l'API scopée de l'IMF
 * (`/imf-partenaires/:id/reseau`) : barèmes, produits activés et garanties
 * propres à cette IMF, souscription directe rattachée à l'IMF.
 */
export default function OngletSimulateur({ imfId }: { imfId: string }) {
  return <Simulateur apiBase={`/imf-partenaires/${imfId}/reseau`} header={false} />;
}
