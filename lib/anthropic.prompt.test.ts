import { describe, it, expect, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: vi.fn() }; } }));

import { NO_PROFOUNDFINDS_PROMPT } from "./anthropic";

describe("NO_PROFOUNDFINDS_PROMPT", () => {
  it("never offers ProFoundFinds Consignment as a route", () => {
    expect(NO_PROFOUNDFINDS_PROMPT).not.toContain('"primary_route": "ProFoundFinds Consignment"');
    expect(NO_PROFOUNDFINDS_PROMPT).not.toContain("Leaving with Home | ProFoundFinds Consignment");
    expect(NO_PROFOUNDFINDS_PROMPT).toContain('never use "ProFoundFinds Consignment"');
    expect(NO_PROFOUNDFINDS_PROMPT).toContain('"primary_route": "Other Consignment"');
  });
});
