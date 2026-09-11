import path from "node:path";
import type { NextConfig } from "next";

/**
 * La carte est exportée en site statique (`out/`) et servie par le nginx du frontend
 * couvertureApp sous /carte (voir frontend/Dockerfile et frontend/nginx.conf).
 * NEXT_PUBLIC_BASE_PATH="" permet de la servir à la racine si besoin.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/carte";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "export",
  basePath,
  // Même valeur côté client pour les URL brutes (GeoJSON, logos) que next/link ne préfixe pas.
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  images: { unoptimized: true },
  // Projet autonome logé dans frontend/ : sans ça, Turbopack prend le lockfile parent pour racine.
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
