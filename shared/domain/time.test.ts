import { describe, expect, it } from "vitest";
import { groupDay, isValidTimeZone, nextRolloverAt } from "./time.ts";

const NY = "America/New_York";
const at = (iso: string) => Date.parse(iso);

describe("groupDay", () => {
  it("rolls over at 04:00 local, not at midnight", () => {
    // 2026-10-14 03:59 EDT = 07:59Z → still the 13th; 04:00 EDT = 08:00Z → the 14th.
    expect(groupDay(at("2026-10-14T07:59:59Z"), NY, 4)).toBe("2026-10-13");
    expect(groupDay(at("2026-10-14T08:00:00Z"), NY, 4)).toBe("2026-10-14");
  });

  it("handles month and year boundaries", () => {
    expect(groupDay(at("2027-01-01T03:00:00Z"), "UTC", 4)).toBe("2026-12-31");
    expect(groupDay(at("2026-03-01T03:00:00Z"), "UTC", 4)).toBe("2026-02-28");
  });

  it("uses wall-clock time across the spring DST change (US: 2026-03-08 02:00 → 03:00)", () => {
    // 03:59 EDT on 03-08 is 07:59Z; 04:00 EDT is 08:00Z.
    expect(groupDay(at("2026-03-08T07:59:00Z"), NY, 4)).toBe("2026-03-07");
    expect(groupDay(at("2026-03-08T08:00:00Z"), NY, 4)).toBe("2026-03-08");
  });

  it("uses wall-clock time across the autumn DST change (US: 2026-11-01 02:00 → 01:00)", () => {
    // 04:00 EST on 11-01 is 09:00Z; 08:59Z is 03:59 EST.
    expect(groupDay(at("2026-11-01T08:59:00Z"), NY, 4)).toBe("2026-10-31");
    expect(groupDay(at("2026-11-01T09:00:00Z"), NY, 4)).toBe("2026-11-01");
  });

  it("validates timezones", () => {
    expect(isValidTimeZone("Europe/Kyiv")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});

describe("nextRolloverAt", () => {
  it("returns the next 04:00 local instant", () => {
    expect(nextRolloverAt(at("2026-10-13T20:00:00Z"), NY, 4)).toBe(at("2026-10-14T08:00:00Z"));
    expect(nextRolloverAt(at("2026-10-14T07:59:59Z"), NY, 4)).toBe(at("2026-10-14T08:00:00Z"));
    expect(nextRolloverAt(at("2026-10-14T08:00:00Z"), NY, 4)).toBe(at("2026-10-15T08:00:00Z"));
  });

  it("is correct on DST change days (23 h and 25 h group days)", () => {
    expect(nextRolloverAt(at("2026-03-07T12:00:00Z"), NY, 4)).toBe(at("2026-03-08T08:00:00Z"));
    expect(nextRolloverAt(at("2026-10-31T12:00:00Z"), NY, 4)).toBe(at("2026-11-01T09:00:00Z"));
  });
});
