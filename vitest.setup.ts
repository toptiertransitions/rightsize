import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Vitest runs as a standalone process and doesn't go through Next.js's env
// loader, so .env.local never reaches process.env without this. Only used by
// tests that need live credentials (lib/documents.security.test.ts); pure
// unit tests are unaffected either way.
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
    }
  }
}
