import { NextResponse } from "next/server";
import { IOS_APP_ID } from "@/lib/ios-app";

// Universal Links association file. Only invite links open in the iOS app —
// every other app.toptiertransitions.com URL keeps opening in the browser.
// Served from a route handler (not public/) so it comes back as JSON with no
// file extension, which is what iOS requires.
export function GET() {
  return NextResponse.json({
    applinks: {
      details: [
        {
          appIDs: [IOS_APP_ID],
          components: [{ "/": "/invite*", comment: "Project and vendor invites" }],
        },
      ],
    },
  });
}
