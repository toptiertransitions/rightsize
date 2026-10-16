import { describe, it, expect } from "vitest";
import { encodeMentions, mentionedIds, plainMentions, splitMentions } from "./mentions";

describe("mentions", () => {
  const picked = [{ id: "user_sam", name: "Sam" }, { id: "user_samr", name: "Sam Rivera" }];

  it("encodes picked names, longest first", () => {
    expect(encodeMentions("Hey @Sam Rivera and @Sam", picked)).toBe("Hey <@user_samr> and <@user_sam>");
  });

  it("finds each mentioned id once", () => {
    expect(mentionedIds("<@user_a> <@user_b> <@user_a>")).toEqual(["user_a", "user_b"]);
  });

  it("renders plain text and segments", () => {
    const names: Record<string, string> = { user_a: "Ann" };
    expect(plainMentions("Hi <@user_a>!", (id) => names[id])).toBe("Hi @Ann!");
    expect(splitMentions("Hi <@user_a>!")).toEqual([{ text: "Hi " }, { mentionId: "user_a" }, { text: "!" }]);
  });
});
