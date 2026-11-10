import { useNavigate } from "react-router-dom";
import { estRefusConnexionRequise } from "../clientAuth";

/**
 * Bouton « Se connecter à mon espace client » affiché sous un message d'erreur de souscription quand le
 * serveur a répondu que ce numéro a déjà un espace (refonte du 2026-11-10 : un 2ᵉ produit se souscrit depuis
 * l'espace client). Ne rend rien pour les autres erreurs. Navigation par `navigate()` et non `<a href>` :
 * un lien classique laissait l'application mobile sur une page blanche.
 */
export function LienEspaceClient({ message }: { message: string }) {
  const navigate = useNavigate();
  if (!estRefusConnexionRequise(message)) return null;
  return (
    <button
      type="button"
      onClick={() => navigate("/client/connexion")}
      style={{
        display: "block",
        margin: "12px auto 0",
        padding: "11px 18px",
        background: "var(--sim-primary, #004b9c)",
        color: "#fff",
        border: "none",
        borderRadius: 12,
        fontWeight: 700,
        fontSize: 14,
        cursor: "pointer",
      }}
    >
      Se connecter à mon espace client →
    </button>
  );
}
