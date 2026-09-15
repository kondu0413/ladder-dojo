import { describe, expect, it } from "vitest";
import { coreVersion, SCHEMA_VERSION } from "./index.js";

describe("core の骨組み", () => {
  it("schemaVersion を返す", () => {
    expect(coreVersion()).toEqual({ schemaVersion: SCHEMA_VERSION });
  });
});
