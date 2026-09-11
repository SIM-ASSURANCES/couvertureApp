/** Squelette affiché instantanément pendant le chargement d'une fiche. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Chargement de la fiche" className="animate-pulse">
      <div className="h-36 bg-zinc-200 md:h-44 dark:bg-zinc-800" />
      <div className="space-y-3 px-5 pt-4">
        <div className="h-3 w-40 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-7 w-48 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-4 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="flex gap-2 pt-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 w-24 rounded-full bg-zinc-200 dark:bg-zinc-800" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 pt-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
          ))}
        </div>
      </div>
    </div>
  );
}
