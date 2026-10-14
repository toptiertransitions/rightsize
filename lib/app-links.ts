// The links that open in the Rightsize app instead of the browser, on BOTH
// iOS and Android. Change them here, for both platforms at once:
//  - iOS reads them from app/.well-known/apple-app-site-association (server;
//    takes effect without a new build, as Apple refreshes its copy).
//  - Android declares them in android/app/src/main/AndroidManifest.xml (the
//    App Links intent filter; needs a new build). Keep that list identical.
// Every one of these must also work as a normal web page, since people
// without the app open the same link in their browser.
export const APP_LINK_PATHS: Array<{ prefix: string; comment: string }> = [
  { prefix: "/invite", comment: "Project, partner and team invites (Access Your Project)" },
  { prefix: "/join", comment: "Community join links and their QR codes" },
];
