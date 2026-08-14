import { useEffect, useState, useCallback } from "react";
import { api } from "./api";

// Actualisation automatique en arrière-plan : reflète sans action de
// l'utilisateur les modifications faites ailleurs (autre admin, autre appareil,
// autre onglet) — ex. un produit désactivé pour un partenaire, une souscription
// confirmée, une demande de commission traitée. Appliqué une fois ici plutôt
// que dans chaque page, puisque `useFetch` est le point de passage commun de
// (quasi) tout le chargement de données de l'application.
const AUTO_REFRESH_MS = 30_000;

export function useFetch<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    (opts?: { silent?: boolean }) => {
      if (!path) return;
      if (!opts?.silent) setLoading(true);
      api
        .get<T>(path)
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((e) => {
          // Un rafraîchissement silencieux en échec (ex. coupure réseau
          // passagère) ne doit pas remplacer un contenu déjà affiché par un
          // message d'erreur — seul le chargement initial est bloquant.
          if (!opts?.silent) setError(e.message);
        })
        .finally(() => {
          if (!opts?.silent) setLoading(false);
        });
    },
    [path]
  );

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  useEffect(() => {
    if (!path) return;
    const id = setInterval(() => {
      // Inutile de rafraîchir un onglet non visible (économie de requêtes,
      // pas de session mobile en arrière-plan).
      if (document.visibilityState === "visible") {
        reload({ silent: true });
      }
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [path, reload]);

  return { data, loading, error, reload, setData };
}
