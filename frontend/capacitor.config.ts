import type { CapacitorConfig } from "@capacitor/cli";

// POC — appId provisoire (à figer avant publication Play Store, il ne peut
// plus changer après la première publication). webDir pointe sur le build
// mobile isolé (voir vite.config.mobile.ts / AppMobile.tsx), pas le site web
// complet.
const config: CapacitorConfig = {
  appId: "com.simassurances.client",
  appName: "SIM Assurances",
  webDir: "dist-mobile",
};

export default config;
