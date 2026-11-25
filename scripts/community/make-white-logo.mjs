// Makes lib/communities/assets/logo-white.png (the community PDF header logo)
// from the TTT master logo in lib/review-collateral/assets: tagline removed,
// every pixel white, transparency kept, trimmed to the artwork.
// Run: node scripts/community/make-white-logo.mjs
import sharp from "sharp";

const SRC = "lib/review-collateral/assets/logo.png";
const OUT = "lib/communities/assets/logo-white.png";
const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * 4;
    // The tagline sits under the house, left of "Transitions"
    if (y >= 362 && x < 700) { data[i + 3] = 0; continue; }
    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
  }
}
await sharp(data, { raw: info }).trim({ threshold: 1 }).png().toFile(OUT);
console.log("wrote", OUT, await sharp(OUT).metadata().then((m) => `${m.width}x${m.height}`));
