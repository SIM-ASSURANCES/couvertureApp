import { useCallback, useEffect, useState } from "react";
import { agentDistApi } from "../../agentDistributionAuth";
import type { Cotation } from "../../cotationsCommun";

/** Même principe que useFetch (src/useFetch.ts), mais pour le client agentDistApi (espace agent de distribution, hors namespace /me). */
export function useAgentDistCotations() {
  const [data, setData] = useState<Cotation[] | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    agentDistApi
      .get<Cotation[]>("/cotations")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, reload };
}
