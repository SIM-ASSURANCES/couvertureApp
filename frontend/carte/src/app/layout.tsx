import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";

import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

import { SITE } from "@/lib/site";

// Charte SIM Assurances : Montserrat pour la communication institutionnelle et commerciale.
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} — Carte interactive de la Côte d'Ivoire`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  authors: [{ name: SITE.publisher.name, url: SITE.publisher.url }],
  publisher: SITE.publisher.name,
  keywords: ["Côte d'Ivoire", "carte", "villes", "Abidjan", "Yamoussoukro", "Bouaké", "tourisme", "SIG", "districts", "régions"],
  openGraph: { type: "website", locale: "fr_CI", siteName: SITE.name, title: SITE.name, description: SITE.description },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: SITE.themeColor,
};

// Applique le thème avant le premier rendu pour éviter tout flash.
const themeScript = `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={montserrat.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="h-dvh overflow-hidden bg-zinc-100 font-sans text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
        <a
          href="#panneau"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lg dark:focus:bg-zinc-900"
        >
          Aller au contenu
        </a>
        {children}
      </body>
    </html>
  );
}
