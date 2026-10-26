import { describe, expect, it } from "vitest";
import { buildShoutoutsSectionHtml, parseBullets, shoutoutLeaderboard } from "./weekly-shoutouts";
import type { Shoutout } from "./shoutouts";

const so = (id: string, to: string, from: string, at: string, message = "Great work"): Shoutout => ({
  id, message, recipientClerkId: `u_${to}`, recipientName: to, authorClerkId: `u_${from}`, authorName: from, createdAt: at,
});

describe("shoutoutLeaderboard", () => {
  const list = [
    so("1", "Ana", "Matt", "2026-10-25T10:00:00Z"),
    so("2", "Ben", "Julie", "2026-10-24T10:00:00Z"),
    so("3", "Ana", "Julie", "2026-10-21T10:00:00Z"),
    so("4", "Cal", "Matt", "2026-10-20T10:00:00Z"),
    so("5", "Ben", "Matt", "2026-10-22T10:00:00Z"),
    so("6", "Ana", "Julie", "2026-10-23T10:00:00Z"),
  ];
  it("ranks by count with shared ranks for ties", () => {
    const lb = shoutoutLeaderboard(list);
    expect(lb.map((r) => [r.rank, r.name, r.count])).toEqual([[1, "Ana", 3], [2, "Ben", 2], [3, "Cal", 1]]);
    expect(shoutoutLeaderboard([so("a", "Zed", "M", "2026-10-25T00:00:00Z"), so("b", "Amy", "M", "2026-10-25T00:00:00Z")]).map((r) => [r.rank, r.name]))
      .toEqual([[1, "Amy"], [1, "Zed"]]);
  });
  it("lists distinct authors in the order received", () => {
    expect(shoutoutLeaderboard(list)[0].from).toEqual(["Julie", "Matt"]);
  });
  it("respects the limit", () => {
    expect(shoutoutLeaderboard(list, 2)).toHaveLength(2);
  });
});

describe("parseBullets", () => {
  it("keeps only bullet lines, strips markers and bold", () => {
    expect(parseBullets("Here you go:\n• One **thing**\n- Two\n* Three\nnot a bullet")).toEqual(["One thing", "Two", "Three"]);
  });
  it("caps the count", () => {
    expect(parseBullets("• a\n• b\n• c\n• d\n• e")).toHaveLength(4);
  });
});

describe("buildShoutoutsSectionHtml", () => {
  const colors = { sage: "#000", tint: "#fff", dark: "#111", muted: "#666" };
  it("shows an empty state", () => {
    expect(buildShoutoutsSectionHtml({ shoutouts: [], leaderboard: [], takeaways: [], colors })).toContain("No shoutouts this week");
  });
  it("escapes user text", () => {
    const s = [so("1", "<b>Ana</b>", "Matt", "2026-10-25T10:00:00Z", "<script>x</script>")];
    const html = buildShoutoutsSectionHtml({ shoutouts: s, leaderboard: shoutoutLeaderboard(s), takeaways: ["<i>t</i>"], colors });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Ana</b>");
    expect(html).not.toContain("<i>t</i>");
    expect(html).toContain("1 shoutout</strong> this week");
  });
});
