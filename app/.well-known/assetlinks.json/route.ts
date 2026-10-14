import { NextResponse } from "next/server";
import { ANDROID_PACKAGE, androidCertFingerprints } from "@/lib/android-app";

// Android App Links association file: lets the Rightsize Android app open
// our invite and community join links (see the intent filter in
// android/app/src/main/AndroidManifest.xml). Android fetches this when the
// app is installed to verify the app may handle app.toptiertransitions.com.
export function GET() {
  return NextResponse.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: ANDROID_PACKAGE,
          sha256_cert_fingerprints: androidCertFingerprints(),
        },
      },
    ],
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
