// Identifiers for the Rightsize Android app, used by the App Links
// association file (app/.well-known/assetlinks.json).
export const ANDROID_PACKAGE = "com.toptiertransitions.rightsizeapp";

// SHA-256 fingerprints of every certificate allowed to open our links in the
// app. Add Play's "App signing key" and the upload key (Play Console > Test
// and release > App integrity) through ANDROID_SHA256_FINGERPRINTS
// (comma-separated) so no code change is needed. The value below is the
// local debug key used for emulator testing.
const DEBUG_FINGERPRINTS = [
  "26:8B:6F:7D:66:12:44:F7:87:D0:8F:09:C7:07:DA:2B:35:18:C2:D8:E3:FD:C4:E2:16:CB:A4:24:48:35:3C:8B",
];

export function androidCertFingerprints(): string[] {
  const extra = (process.env.ANDROID_SHA256_FINGERPRINTS ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s));
  return [...new Set([...DEBUG_FINGERPRINTS, ...extra])];
}
