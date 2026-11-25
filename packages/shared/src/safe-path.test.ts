import { describe, expect, it } from "vitest";
import { safeInternalPath } from "./safe-path";

describe("safeInternalPath", () => {
  it("garde les chemins internes, avec paramètres et ancre", () => {
    expect(safeInternalPath("/app", "/x")).toBe("/app");
    expect(safeInternalPath("/join/abc?x=1#y", "/x")).toBe("/join/abc?x=1#y");
  });

  it("refuse tout ce qui mène à un autre site", () => {
    for (const next of ["//evil.example", "/\\evil.example/app", "/\t/evil.example", "https://evil.example", "evil.example", "javascript:alert(1)", "", null, undefined, 42]) {
      expect(safeInternalPath(next, "/x")).toBe("/x");
    }
    // Un caractère encodé reste un simple chemin interne.
    expect(safeInternalPath("/a%0Ab", "/x")).toBe("/a%0Ab");
  });

  it("refuse les chemins trop longs", () => {
    expect(safeInternalPath(`/${"a".repeat(600)}`, "/x")).toBe("/x");
  });
});
