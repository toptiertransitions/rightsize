import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // Not "com.toptiertransitions.rightsize" — that string got silently
  // reserved against the Apple ID during earlier "Personal Team" testing
  // (before the paid Organization account was approved) and Apple refuses
  // to re-register it under the real team. Using a distinct id instead.
  appId: "com.toptiertransitions.rightsizeapp",
  // On-device home-screen name. Kept short deliberately — the fuller
  // "Rightsize by Top Tier Transitions" is the separate App Store Connect
  // listing name, set directly in App Store Connect, not here.
  appName: "Rightsize",
  // webDir is required by Capacitor CLI but unused in remote-URL mode
  webDir: "out",
  server: {
    // Load the live Vercel deployment — no static bundle, no separate release cycle
    url: "https://app.toptiertransitions.com",
    cleartext: false,
    allowNavigation: [
      "app.toptiertransitions.com",
      "*.clerk.accounts.dev",
      "clerk.toptiertransitions.com",
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#2d4a3e",
      showSpinner: false,
      androidSplashResourceName: "splash",
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "Light",
      backgroundColor: "#2d4a3e",
      overlaysWebView: false,
    },
  },
  ios: {
    contentInset: "automatic",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
