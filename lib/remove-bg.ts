export async function removeBackground(imageBuffer: Buffer): Promise<Buffer> {
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) throw new Error("REMOVE_BG_API_KEY is not configured");
  const form = new FormData();
  form.append("image_file", new Blob([new Uint8Array(imageBuffer)], { type: "image/jpeg" }), "image.jpg");
  form.append("size", "auto");
  const res = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: { "X-Api-Key": apiKey },
    body: form,
  });
  if (!res.ok) throw new Error(`remove.bg error ${res.status}: ${await res.text().catch(() => "")}`);
  return Buffer.from(await res.arrayBuffer());
}
