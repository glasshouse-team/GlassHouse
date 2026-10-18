import { describe, expect, it } from "vitest";
import { HERO_1_POLICY } from "@/seed/fixtures";
import { type CheckResult, overallState, policyDiff, runCheck } from "./status";

const row = (state: CheckResult["state"]): CheckResult => ({
  group: "g",
  label: state,
  state,
  detail: "",
});

describe("runCheck", () => {
  it("passes a result through with its group and label", async () => {
    const result = await runCheck("Database", "Supabase", async () => ({
      state: "ok",
      detail: "connected",
    }));
    expect(result).toEqual({
      group: "Database",
      label: "Supabase",
      state: "ok",
      detail: "connected",
    });
  });

  it("turns a throw into a red row", async () => {
    const result = await runCheck("Claude", "ping", async () => {
      throw new Error("401 invalid key");
    });
    expect(result.state).toBe("fail");
    expect(result.detail).toBe("401 invalid key");
  });

  it("turns a slow check into a red row and aborts it", async () => {
    let aborted = false;
    const result = await runCheck(
      "3D",
      "worlds",
      (signal) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () => {
            aborted = true;
          });
          setTimeout(() => resolve({ state: "ok", detail: "late" }), 200);
        }),
      20,
    );
    expect(result).toMatchObject({ state: "fail", detail: "timed out after 0 s" });
    expect(aborted).toBe(true);
  });
});

describe("overallState", () => {
  it("is red if any row is red, amber if any is amber, else green", () => {
    expect(overallState([row("ok"), row("warn"), row("fail")])).toBe("fail");
    expect(overallState([row("ok"), row("warn")])).toBe("warn");
    expect(overallState([row("ok")])).toBe("ok");
  });
});

describe("policyDiff", () => {
  it("is empty when the row matches the fixture", () => {
    expect(policyDiff({ listing_id: "x", ...HERO_1_POLICY }, HERO_1_POLICY)).toEqual([]);
  });
  it("names the changed fields only", () => {
    const changed = { ...HERO_1_POLICY, floor_nightly_cents: 9_000, allowed_terms: [] };
    expect(policyDiff(changed, HERO_1_POLICY)).toEqual(["floor_nightly_cents", "allowed_terms"]);
  });
  it("flags a missing row", () => {
    expect(policyDiff(null, HERO_1_POLICY)).toEqual(["(no policy row)"]);
  });
});
