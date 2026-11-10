import { useNavigate } from "react-router-dom";
import { estRefusConnexionRequise } from "../clientAuth";

/**
 * Bandeau d'avertissement affiché dans le formulaire dès que le numéro saisi appartient à un client qui a
 * déjà un espace : il doit s'y connecter pour souscrire un autre produit. Évite de lui faire remplir tout
 * le formulaire avant de lui annoncer le refus du serveur.
 */
export function BandeauEspaceClient({ message }: { message: string }) {
  const navigate = useNavigate();
  return (
    <div
      role="alert"
      style={{
        background: "#fff7ed",
        border: "1px solid #fed7aa",
        borderRadius: 12,
        padding: "14px 16px",
        marginBottom: 16,
        color: "#7c2d12",
        fontSize: 13.5,
        lineHeight: 1.5,
      }}
    >
      <strong>Vous avez déjà un espace client.</strong>{" "}
      {message.replace(/^Vous avez déjà un espace client\.\s*/i, "")}
      <button
        type="button"
        onClick={() => navigate("/client/connexion")}
        style={{
          display: "block",
          marginTop: 10,
          padding: "10px 16px",
          background: "var(--sim-primary, #004b9c)",
          color: "#fff",
          border: "none",
          borderRadius: 10,
          fontWeight: 700,
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        Se connecter à mon espace client →
      </button>
    </div>
  );
}

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
