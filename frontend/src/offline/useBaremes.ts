import { useEffect, useState } from "react";
import { api } from "../api";
import { getBareme, putBareme } from "./db";

/**
 * Charge un barème (SECURPRO/SECURSTOCK) depuis l'API quand la connexion est
 * disponible — en le mettant à jour dans le cache local IndexedDB au passage
 * — ou depuis ce même cache quand l'appareil est hors-ligne. Remplace un
 * `useFetch` classique là où le simulateur doit rester utilisable sans réseau.
 */
export function useBaremeCache<T>(cacheKey: string, path: string | null, online: boolean): T | null {
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    if (!path) {
      setData(null);
      return;
    }
    let cancelled = false;
    if (online) {
      api
        .get<T>(path)
        .then((d) => {
          if (cancelled) return;
          setData(d);
          putBareme(cacheKey, d);
        })
        .catch(() => {
          getBareme<T>(cacheKey).then((cached) => {
            if (!cancelled) setData(cached);
          });
        });
    } else {
      getBareme<T>(cacheKey).then((cached) => {
        if (!cancelled) setData(cached);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [path, online, cacheKey]);

  return data;
}
