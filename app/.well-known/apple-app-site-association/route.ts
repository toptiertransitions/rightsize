import { NextResponse } from "next/server";
import { IOS_APP_ID } from "@/lib/ios-app";
import { APP_LINK_PATHS } from "@/lib/app-links";

// Universal Links association file. Only the links in lib/app-links.ts open
// in the iOS app (the same list as Android); every other
// app.toptiertransitions.com URL keeps opening in the browser.
// Served from a route handler (not public/) so it comes back as JSON with no
// file extension, which is what iOS requires.
export function GET() {
  return NextResponse.json({
    applinks: {
      details: [
        {
          appIDs: [IOS_APP_ID],
          components: APP_LINK_PATHS.map(({ prefix, comment }) => ({ "/": `${prefix}*`, comment })),
        },
      ],
    },
  });
}
