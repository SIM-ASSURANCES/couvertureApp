import { useOutletContext } from "react-router-dom";
import type { ImfFicheContext } from "../Fiche";
import OngletGeneral from "./OngletGeneral";
import OngletReseau from "./OngletReseau";
import OngletSimulateur from "./OngletSimulateur";
import OngletPortefeuille from "./OngletPortefeuille";
import OngletProduits from "./OngletProduits";
import OngletBaremes from "./OngletBaremes";
import OngletDocuments from "./OngletDocuments";

/** Accès au contexte de la fiche IMF (fourni par ImfFicheLayout via <Outlet context>). */
export function useImfFiche() {
  return useOutletContext<ImfFicheContext>();
}

/* Éléments de route : chaque onglet de la fiche IMF est une route fille
 * `/admin/imfs/:imfId/<onglet>` — ces wrappers injectent le contexte. */

export function RouteGeneral() {
  const c = useImfFiche();
  return <OngletGeneral imf={c.imf} reload={c.reload} notify={c.notify} />;
}
export function RouteReseau() {
  return <OngletReseau imfId={useImfFiche().imfId} />;
}
export function RouteSimulateur() {
  return <OngletSimulateur imfId={useImfFiche().imfId} />;
}
export function RoutePortefeuille() {
  return <OngletPortefeuille imfId={useImfFiche().imfId} />;
}
export function RouteProduits() {
  const c = useImfFiche();
  return <OngletProduits imfId={c.imfId} notify={c.notify} />;
}
export function RouteBaremes() {
  const c = useImfFiche();
  return <OngletBaremes imfId={c.imfId} notify={c.notify} />;
}
export function RouteDocuments() {
  const c = useImfFiche();
  return <OngletDocuments imfId={c.imfId} notify={c.notify} />;
}
