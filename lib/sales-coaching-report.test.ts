import { describe, it, expect, vi } from "vitest";
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: () => {}, revalidatePath: () => {} }));
import { cleanActivityText } from "./sales-coaching-report";

describe("cleanActivityText", () => {
  it("splits out subject and sender, decodes entities, drops the quoted reply chain", () => {
    const note = "Subject: Lunch?\nFrom: Nicole Wozniak <nicole@toptiertransitions.com>\n\nHi Sandi &amp; Jill, would Tuesday work?\n\nOn Mon, Oct 6, 2026 at 9:00 AM Sandi <s@x.com> wrote:\n> Sure, when?\n> Thanks";
    const out = cleanActivityText(note);
    expect(out.subject).toBe("Lunch?");
    expect(out.from).toContain("toptiertransitions.com");
    expect(out.text).toBe("Hi Sandi & Jill, would Tuesday work?");
  });

  it("keeps plain notes and caps very long text", () => {
    expect(cleanActivityText("Met for coffee, she will refer her next client.").text).toBe("Met for coffee, she will refer her next client.");
    expect(cleanActivityText("x".repeat(10000)).text.endsWith("[...trimmed]")).toBe(true);
  });
});
