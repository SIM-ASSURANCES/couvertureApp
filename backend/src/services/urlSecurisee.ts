// Appels HTTP sortants vers une URL fournie par un tiers (webhooks partenaires)
// sans pouvoir être détournés vers le réseau interne (SSRF) — audit sécurité
// 2026-10-05. Remplace un filtre qui ne comparait que des chaînes de
// caractères et se contournait par : `https://[::1]/` (le hostname garde ses
// crochets), les adresses IPv6 privées/mappées, la plage CGNAT 100.64.0.0/10,
// un nom DNS public résolvant vers une IP privée, et les redirections 3xx.
//
// Trois couches complémentaires :
//   1. hoteStatiquementAutorise : refus immédiat des littéraux IP non publics
//      et des noms manifestement internes (utilisé à la saisie ET à l'envoi) ;
//   2. lookupSecurise : l'adresse IP réellement CONNECTÉE est vérifiée au
//      moment de la connexion (pas seulement à la saisie), ce qui neutralise
//      aussi le "DNS rebinding" (nom valide à la saisie, privé à l'envoi) ;
//   3. https.request ne suit jamais les redirections : un 3xx est un échec,
//      jamais un saut vers http://169.254.169.254/ ou un service interne.
//
// Limite assumée : Node ne passe pas par `lookup` pour un littéral IP — ce cas
// est couvert par la couche 1.

import net from "node:net";
import dns from "node:dns";
import https from "node:https";

// ─────────── Plages IPv4 non routables publiquement (CIDR) ───────────

const PLAGES_V4_INTERDITES: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8], // "ce réseau"
  ["10.0.0.0", 8], // privé
  ["100.64.0.0", 10], // CGNAT (RFC 6598) — souvent le réseau interne des hébergeurs
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local — métadonnées cloud (169.254.169.254)
  ["172.16.0.0", 12], // privé
  ["192.0.0.0", 24], // protocoles IETF
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // relais 6to4 (déprécié)
  ["192.168.0.0", 16], // privé
  ["198.18.0.0", 15], // tests de performance
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // réservé + broadcast
];

function v4EnEntier(ip: string): number {
  return ip.split(".").reduce((acc, octet) => ((acc << 8) + Number(octet)) >>> 0, 0);
}

function v4Public(ip: string): boolean {
  const n = v4EnEntier(ip);
  return !PLAGES_V4_INTERDITES.some(([base, bits]) => {
    const masque = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & masque) === (v4EnEntier(base) & masque);
  });
}

// ─────────── IPv6 ───────────

/** Décompose une adresse IPv6 (compressée, avec IPv4 incorporée éventuelle) en 8 groupes de 16 bits ; null si invalide. */
function groupesV6(adresse: string): number[] | null {
  let s = adresse.toLowerCase().split("%")[0]; // retire l'éventuel identifiant de zone
  const incorporee = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (incorporee) {
    if (!net.isIPv4(incorporee[2])) return null;
    const o = incorporee[2].split(".").map(Number);
    s = `${incorporee[1]}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const morceaux = s.split("::");
  if (morceaux.length > 2) return null;
  const tete = morceaux[0] ? morceaux[0].split(":") : [];
  const queue = morceaux.length === 2 && morceaux[1] ? morceaux[1].split(":") : [];
  let groupes: string[];
  if (morceaux.length === 1) {
    groupes = tete;
  } else {
    const manquants = 8 - tete.length - queue.length;
    if (manquants < 1) return null;
    groupes = [...tete, ...Array<string>(manquants).fill("0"), ...queue];
  }
  if (groupes.length !== 8) return null;
  const valeurs = groupes.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return valeurs.some(Number.isNaN) ? null : valeurs;
}

function v4DepuisGroupes(haut: number, bas: number): string {
  return `${haut >> 8}.${haut & 255}.${bas >> 8}.${bas & 255}`;
}

function v6Public(adresse: string): boolean {
  const g = groupesV6(adresse);
  if (!g) return false; // illisible = refusé
  const zeros = (de: number, a: number) => g.slice(de, a).every((x) => x === 0);

  if (zeros(0, 8)) return false; // :: (non spécifiée)
  if (zeros(0, 7) && g[7] === 1) return false; // ::1 (loopback)
  if (zeros(0, 5) && g[5] === 0xffff) return v4Public(v4DepuisGroupes(g[6], g[7])); // ::ffff:a.b.c.d (IPv4 mappée)
  if (zeros(0, 6)) return v4Public(v4DepuisGroupes(g[6], g[7])); // ::a.b.c.d (IPv4-compatible, dépréciée)
  if (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6)) return v4Public(v4DepuisGroupes(g[6], g[7])); // NAT64
  if (g[0] === 0x2002) return v4Public(v4DepuisGroupes(g[1], g[2])); // 6to4 : IPv4 incorporée
  if ((g[0] & 0xfe00) === 0xfc00) return false; // fc00::/7 (ULA, privé)
  if ((g[0] & 0xffc0) === 0xfe80) return false; // fe80::/10 (link-local)
  if ((g[0] & 0xffc0) === 0xfec0) return false; // fec0::/10 (site-local, déprécié)
  if ((g[0] >> 8) === 0xff) return false; // ff00::/8 (multicast)
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  return true;
}

/** Adresse IP (v4 ou v6) joignable sur Internet public — jamais loopback, privée, link-local, CGNAT, multicast ou réservée. */
export function ipPubliqueRoutable(ip: string): boolean {
  if (net.isIPv4(ip)) return v4Public(ip);
  if (net.isIPv6(ip)) return v6Public(ip);
  return false;
}

// ─────────── Hôtes ───────────

const SUFFIXES_INTERNES = /\.(localhost|local|internal|localdomain|lan|home|corp|intranet|home\.arpa)$/;

/**
 * Contrôle STATIQUE d'un nom d'hôte tel que fourni dans une URL (`URL.hostname`,
 * donc avec les crochets d'une IPv6). Ne résout pas le DNS : voir lookupSecurise
 * pour la vérification de l'adresse réellement connectée.
 */
export function hoteStatiquementAutorise(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!h) return false;
  if (net.isIP(h)) return ipPubliqueRoutable(h);
  if (h === "localhost" || SUFFIXES_INTERNES.test(h)) return false;
  if (!h.includes(".")) return false; // nom court = service interne (docker, k8s…)
  return true;
}

// ─────────── Connexion sécurisée ───────────

/**
 * Remplaçant de `dns.lookup` pour https.request : résout le nom puis REFUSE la
 * connexion si l'une des adresses obtenues n'est pas publique. S'exécute à
 * chaque connexion — un nom qui change de cible entre la saisie et l'envoi
 * (DNS rebinding) est donc rattrapé.
 */
export const lookupSecurise: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, adresses) => {
    if (err) return callback(err, "", 0);
    const liste = adresses as dns.LookupAddress[];
    const refusee = liste.find((a) => !ipPubliqueRoutable(a.address));
    if (liste.length === 0 || refusee) {
      const e = new Error(`Hôte refusé : ${hostname} résout vers une adresse non publique`) as NodeJS.ErrnoException;
      e.code = "EHOSTREFUSE";
      return callback(e, "", 0);
    }
    // Node 20+ (autoSelectFamily) demande la liste complète ; sinon une seule adresse.
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, l: dns.LookupAddress[]) => void)(null, liste);
    return callback(null, liste[0].address, liste[0].family);
  });
};

/**
 * POST JSON vers une URL https externe, sans redirections et avec contrôle de
 * l'IP connectée. Renvoie le code HTTP de la réponse ; lève en cas de refus
 * d'hôte, d'erreur réseau ou de dépassement du délai.
 */
export function postJsonSecurise(
  url: string,
  headers: Record<string, string>,
  corps: string,
  delaiMs: number
): Promise<number> {
  return new Promise((resolve, reject) => {
    let cible: URL;
    try {
      cible = new URL(url);
    } catch {
      return reject(new Error("URL invalide"));
    }
    if (cible.protocol !== "https:" || cible.username || cible.password || !hoteStatiquementAutorise(cible.hostname)) {
      return reject(new Error("URL refusée (https et hôte public requis)"));
    }
    const req = https.request(
      {
        method: "POST",
        hostname: cible.hostname.replace(/^\[|\]$/g, ""),
        port: cible.port || 443,
        path: `${cible.pathname}${cible.search}`,
        headers: { ...headers, "Content-Length": String(Buffer.byteLength(corps)) },
        lookup: lookupSecurise,
        agent: false, // pas de connexion réutilisée d'un appel à l'autre
        timeout: delaiMs,
      },
      (res) => {
        res.resume(); // la réponse n'est jamais lue ni renvoyée (SSRF aveugle au pire)
        resolve(res.statusCode ?? 0);
      }
    );
    req.on("timeout", () => req.destroy(new Error("Délai dépassé")));
    req.on("error", reject);
    req.end(corps);
  });
}
