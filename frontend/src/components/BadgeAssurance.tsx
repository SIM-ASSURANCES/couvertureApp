import type { ReactNode } from "react";
import { Flame, HeartPulse, ShieldCheck } from "lucide-react";
import { Badge } from "./ui";

/**
 * Assurances de la branche, dans l'ordre d'affichage — miroir de
 * backend/src/services/sousBranches.ts. Sert les filtres « Toutes les
 * Assurances » : ajouter une Assurance ici l'ajoute à chacun d'eux.
 */
export const ASSURANCES = [
  { sousBranche: "ASSURANCES_ACCIDENTS", libelle: "Assurances Accidents" },
  { sousBranche: "ASSURANCES_DOMMAGES", libelle: "Assurances Dommages" },
  { sousBranche: "ASSURANCES_SANTE", libelle: "Assurances Santé" },
] as const;
export type SousBrancheAssurance = (typeof ASSURANCES)[number]["sousBranche"];

/** `<option>` d'un filtre par Assurance (à placer après l'option « Toutes les Assurances »). */
export function OptionsAssurances() {
  return (
    <>
      {ASSURANCES.map((a) => (
        <option key={a.sousBranche} value={a.sousBranche}>
          {a.libelle}
        </option>
      ))}
    </>
  );
}

/**
 * Pastille d'un produit, colorée selon son Assurance : Dommages (orange),
 * Santé (vert), Accidents et tout le reste (bleu). Remplace le ternaire
 * « Dommages, sinon Accidents » qui aurait rangé la Santé avec les Accidents.
 */
export function BadgeAssurance({
  sousBranche,
  taille = 12,
  children,
}: {
  sousBranche?: string | null;
  taille?: number;
  children: ReactNode;
}) {
  if (sousBranche === "ASSURANCES_DOMMAGES") {
    return (
      <Badge kind="warning">
        <Flame size={taille} /> {children}
      </Badge>
    );
  }
  if (sousBranche === "ASSURANCES_SANTE") {
    return (
      <Badge kind="success">
        <HeartPulse size={taille} /> {children}
      </Badge>
    );
  }
  return (
    <Badge kind="info">
      <ShieldCheck size={taille} /> {children}
    </Badge>
  );
}
