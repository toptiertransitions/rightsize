import { NextRequest, NextResponse } from "next/server";
import { RECORD_ID, apiError, handleRouteError, nameFor, requireCommunityAccess } from "@/lib/communities/access";
import { guideFileName, renderCommunityGuidePdf } from "@/lib/communities/pdf";
import { getCommunity, logActivity } from "@/lib/communities/service";

// One-page "TTT Community Guide" PDF.
//   ?internal=1      include Internal Notes (off by default)
//   ?hideUnknown=1   leave out rules still to confirm (off by default)
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireCommunityAccess("view");
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  if (!RECORD_ID.test(id)) return apiError(404, "Community not found.");
  try {
    const detail = await getCommunity(id);
    if (!detail) return apiError(404, "Community not found.");
    const opts = {
      includeInternalNotes: req.nextUrl.searchParams.get("internal") === "1",
      hideUnknown: req.nextUrl.searchParams.get("hideUnknown") === "1",
    };
    const { buffer, scale, trimLevel } = await renderCommunityGuidePdf(detail.community, detail.contacts, opts);
    await logActivity(id, "PDF Generated", `Downloaded the Community Guide PDF${opts.includeInternalNotes ? " with internal notes" : ""}`, await nameFor(actor));
    console.log(`[communities] pdf ${id} body=${scale}pt trim=${trimLevel}`);
    const name = guideFileName(detail.community);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return handleRouteError(e, "pdf");
  }
}
