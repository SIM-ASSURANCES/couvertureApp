import { CATEGORIES_PARTENAIRES } from "../categoriesPartenaires";

/**
 * Catégorie d'intermédiaire d'un partenaire — détermine son identifiant
 * (ex. catégorie 1 → 1.0001). `verrouille` : l'identifiant est déjà attribué,
 * la catégorie ne peut donc plus changer (le backend la refuse aussi, en 409).
 */
export default function SelectCategoriePartenaire({
  value,
  onChange,
  verrouille = false,
  requis = false,
}: {
  /** "" = aucune catégorie choisie. */
  value: string;
  onChange: (valeur: string) => void;
  verrouille?: boolean;
  requis?: boolean;
}) {
  return (
    <div className="field">
      <label className="label">
        Catégorie {requis && <span className="req">*</span>}
      </label>
      <select
        className="select"
        required={requis}
        disabled={verrouille}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{requis ? "Choisir une catégorie…" : "Aucune pour l'instant"}</option>
        {CATEGORIES_PARTENAIRES.map((c) => (
          <option key={c.numero} value={String(c.numero)}>
            {c.numero}° — {c.libelle}
          </option>
        ))}
      </select>
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        {verrouille
          ? "Verrouillée : l'identifiant du partenaire est déjà attribué."
          : "Détermine l'identifiant du partenaire (ex. catégorie 1 → 1.0001). Non modifiable une fois attribué."}
      </div>
    </div>
  );
}
