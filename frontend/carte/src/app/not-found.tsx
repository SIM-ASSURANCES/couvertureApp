import Link from "next/link";

import { BrandLogo } from "@/components/ui/BrandLogo";

export default function NotFound() {
  return (
    <main className="grid h-dvh place-items-center p-6 text-center">
      <div>
        <div className="flex justify-center p-4">
          <BrandLogo height={28} />
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Page introuvable</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Cette ville n&apos;a pas encore de fiche, ou l&apos;adresse est incorrecte.</p>
        <Link href="/" className="mt-6 inline-flex h-10 items-center rounded-full bg-accent-700 px-5 text-sm font-medium text-white hover:bg-accent-800">
          Retour à la carte
        </Link>
      </div>
    </main>
  );
}
