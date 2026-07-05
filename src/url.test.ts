import { describe, expect, it } from "vitest";
import { isSameVideoEntry, parseBilibiliUrl } from "./url";
describe("Bilibili URL", () => {
  it("normalizes BV and keeps p", () =>
    expect(
      parseBilibiliUrl(
        "https://www.bilibili.com/video/BV1xx?p=02&utm_source=x",
      ),
    ).toEqual({
      id: "BV1xx",
      url: "https://www.bilibili.com/video/BV1xx?p=2",
    }));
  it("accepts av", () =>
    expect(parseBilibiliUrl("https://bilibili.com/video/av123/")?.id).toBe(
      "av123",
    ));
  it("rejects lookalike hosts and paths", () => {
    expect(parseBilibiliUrl("https://evil.com/video/BV1")).toBeNull();
    expect(parseBilibiliUrl("https://www.bilibili.com/read/BV1")).toBeNull();
  });
});

describe("video entry matching", () => {
  it("ignores trailing slash and tracking parameters", () =>
    expect(
      isSameVideoEntry(
        "https://www.bilibili.com/video/BV1xx/?spm_id_from=x",
        "https://www.bilibili.com/video/BV1xx",
      ),
    ).toBe(true));
  it("distinguishes videos and multi-part entries", () => {
    expect(
      isSameVideoEntry(
        "https://www.bilibili.com/video/BV1aa",
        "https://www.bilibili.com/video/BV1bb",
      ),
    ).toBe(false);
    expect(
      isSameVideoEntry(
        "https://www.bilibili.com/video/BV1aa?p=2",
        "https://www.bilibili.com/video/BV1aa?p=1",
      ),
    ).toBe(false);
  });
});
