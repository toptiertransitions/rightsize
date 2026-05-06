import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getItemsForEstateSale, getEstateById } from "@/lib/airtable";
import JSZip from "jszip";

export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTAdmin" && sysRole !== "TTTManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const [estate, items] = await Promise.all([
    getEstateById(id),
    getItemsForEstateSale(id),
  ]);

  if (!estate) return NextResponse.json({ error: "Estate not found" }, { status: 404 });

  const itemsWithPhotos = items.filter(item => !!item.photoUrl);

  // Fetch images in parallel (batches of 10 to avoid overwhelming Cloudinary)
  const zip = new JSZip();
  const BATCH = 10;

  for (let i = 0; i < itemsWithPhotos.length; i += BATCH) {
    const batch = itemsWithPhotos.slice(i, i + BATCH);
    await Promise.all(batch.map(async (item) => {
      try {
        const res = await fetch(item.photoUrl!);
        if (!res.ok) return;
        const buf = await res.arrayBuffer();
        const contentType = res.headers.get("content-type") || "image/jpeg";
        const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
        const safeName = (item.itemName || `item_${item.id}`)
          .replace(/[^a-z0-9\s-]/gi, "")
          .trim()
          .replace(/\s+/g, "_")
          .slice(0, 80);
        zip.file(`${String(i + batch.indexOf(item) + 1).padStart(3, "0")}_${safeName}.${ext}`, buf);
      } catch {
        // Skip images that fail to fetch
      }
    }));
  }

  const zipBuffer = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
  const filename = `${estate.name.replace(/[^a-z0-9]/gi, "_")}_images.zip`;

  return new NextResponse(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
