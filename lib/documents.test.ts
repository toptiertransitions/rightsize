import { describe, it, expect } from "vitest";
import { validateUpload, sanitizeFileName, extensionForMimeType, generateFileKey, MAX_FILE_SIZE_BYTES } from "./documents";

const PDF_BYTES = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(100)]);
const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]);
const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
const SVG_BYTES = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const HTML_BYTES = Buffer.from("<!DOCTYPE html><html><body><script>alert(document.cookie)</script></body></html>");

describe("validateUpload — blocked file types", () => {
  it("rejects an SVG disguised with an image/png declared type", () => {
    const result = validateUpload(SVG_BYTES, "image/png", SVG_BYTES.length);
    expect(result.ok).toBe(false);
  });

  it("rejects raw HTML/script content regardless of declared type", () => {
    const result = validateUpload(HTML_BYTES, "application/pdf", HTML_BYTES.length);
    expect(result.ok).toBe(false);
  });

  it("rejects a declared type that isn't on the allowlist", () => {
    const result = validateUpload(PDF_BYTES, "application/x-msdownload", PDF_BYTES.length);
    expect(result.ok).toBe(false);
  });

  it("rejects bytes that don't match the declared type (e.g. a renamed .exe claiming to be a PDF)", () => {
    const fakeExe = Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.alloc(100)]); // MZ header
    const result = validateUpload(fakeExe, "application/pdf", fakeExe.length);
    expect(result.ok).toBe(false);
  });
});

describe("validateUpload — oversized files", () => {
  it("rejects a file over the 25MB limit", () => {
    const result = validateUpload(PDF_BYTES, "application/pdf", MAX_FILE_SIZE_BYTES + 1);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/25MB/);
  });

  it("accepts a file exactly at the limit", () => {
    const result = validateUpload(PDF_BYTES, "application/pdf", MAX_FILE_SIZE_BYTES);
    expect(result.ok).toBe(true);
  });
});

describe("validateUpload — legitimate files pass", () => {
  it("accepts a real PDF", () => {
    const result = validateUpload(PDF_BYTES, "application/pdf", PDF_BYTES.length);
    expect(result).toEqual({ ok: true, mimeType: "application/pdf" });
  });

  it("accepts a real PNG", () => {
    const result = validateUpload(PNG_BYTES, "image/png", PNG_BYTES.length);
    expect(result).toEqual({ ok: true, mimeType: "image/png" });
  });

  it("accepts a real JPEG", () => {
    const result = validateUpload(JPEG_BYTES, "image/jpeg", JPEG_BYTES.length);
    expect(result).toEqual({ ok: true, mimeType: "image/jpeg" });
  });
});

describe("sanitizeFileName", () => {
  it("strips path separators (path traversal attempt)", () => {
    expect(sanitizeFileName("../../etc/passwd")).not.toContain("/");
    expect(sanitizeFileName("..\\..\\windows\\system32\\config")).not.toContain("\\");
  });

  it("strips the original extension (real extension always comes from verified MIME type)", () => {
    expect(sanitizeFileName("report.pdf")).toBe("report");
  });

  it("strips special characters that could break headers or shells", () => {
    const result = sanitizeFileName('weird"; rm -rf / #.pdf');
    expect(result).not.toMatch(/[";#]/);
  });

  it("never returns an empty string", () => {
    expect(sanitizeFileName("...")).toBeTruthy();
    expect(sanitizeFileName("")).toBeTruthy();
  });
});

describe("extensionForMimeType", () => {
  it("maps known types correctly", () => {
    expect(extensionForMimeType("application/pdf")).toBe("pdf");
    expect(extensionForMimeType("image/png")).toBe("png");
    expect(extensionForMimeType("image/jpeg")).toBe("jpg");
  });
});

describe("generateFileKey", () => {
  it("produces unique, non-sequential IDs", () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateFileKey()));
    expect(keys.size).toBe(50);
    for (const key of keys) {
      expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }
  });
});
