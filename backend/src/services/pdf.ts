import puppeteer, { type Browser } from "puppeteer-core";

// Chromium système installé via apk sur l'image Alpine (voir Dockerfile) —
// puppeteer-core n'embarque pas son propre binaire (contrairement à
// `puppeteer`), ce qui garde l'image légère.
const EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium-browser";

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        executablePath: EXECUTABLE_PATH,
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      })
      .then((b) => {
        // Le navigateur peut planter/être tué par le système (mémoire) — on
        // le relance à la prochaine demande plutôt que de rester bloqué.
        b.on("disconnected", () => {
          browserPromise = null;
        });
        return b;
      });
  }
  return browserPromise;
}

/** Rend un document HTML autonome (avec son <style>) en PDF A4 — texte réel, pas une image. */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load", timeout: 30000 });
    const pdf = await page.pdf({
      format: "a4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

/** Rend un document HTML autonome en image PNG, aux dimensions exactes de la fenêtre (ex : carte virtuelle). */
export async function htmlToPng(html: string, width: number, height: number): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: "load", timeout: 30000 });
    const png = await page.screenshot({ type: "png", omitBackground: false });
    return Buffer.from(png);
  } finally {
    await page.close();
  }
}
