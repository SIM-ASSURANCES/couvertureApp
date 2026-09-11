import { ExplorerProvider } from "@/components/explorer/ExplorerProvider";
import { ExplorerShell } from "@/components/explorer/ExplorerShell";
import { getCityIndex } from "@/server/cities";

/**
 * Mise en page persistante : la carte reste montée pendant la navigation entre
 * l'accueil (/) et les fiches (/ville/[id]). Seul le contenu du panneau change.
 */
export default async function ExplorerLayout({ children }: { children: React.ReactNode }) {
  const cities = await getCityIndex();
  return (
    <ExplorerProvider cities={cities}>
      <ExplorerShell>{children}</ExplorerShell>
    </ExplorerProvider>
  );
}
