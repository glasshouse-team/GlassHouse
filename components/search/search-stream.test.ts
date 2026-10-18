import { describe, expect, it } from "vitest";
import { readLines } from "./search-stream";

describe("readLines", () => {
  it("parses complete lines and keeps a partial one for the next chunk", () => {
    const first = readLines('{"type":"step","text":"Reading your brief"}\n{"type":"st');
    expect(first.lines).toEqual([{ type: "step", text: "Reading your brief" }]);
    const second = readLines(`${first.rest}ep","text":"Checking 5 homes"}\n`);
    expect(second.lines).toEqual([{ type: "step", text: "Checking 5 homes" }]);
    expect(second.rest).toBe("");
  });

  it("skips blank, broken and unknown lines", () => {
    expect(
      readLines('\nnot json\n{"type":"mystery"}\n{"type":"error","message":"x"}\n').lines,
    ).toEqual([{ type: "error", message: "x" }]);
  });
});
