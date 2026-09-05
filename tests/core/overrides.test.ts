import { describe, expect, it } from "vitest";
import {
  DiagnosticCodes,
  parsePresentationOverrides,
} from "../../src/index.js";

describe("presentation overrides", () => {
  it("validates and normalizes role ids", () => {
    const result = parsePresentationOverrides(
      JSON.stringify({
        " General ": {
          nameMarkup: "[b]General[/b]",
          abilityMarkup: "[color=#C00000]Text[/color]",
        },
      }),
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.value?.general).toEqual({
      nameMarkup: "[b]General[/b]",
      abilityMarkup: "[color=#C00000]Text[/color]",
      image: null,
    });
  });

  it("rejects unknown fields", () => {
    const result = parsePresentationOverrides(
      JSON.stringify({
        general: { html: "<b>unsafe</b>" },
      }),
    );

    expect(result.value).toBeNull();
    expect(result.diagnostics[0]?.code).toBe(
      DiagnosticCodes.OVERRIDES_JSON_INVALID,
    );
  });

  it("rejects malformed JSON", () => {
    const result = parsePresentationOverrides("{");

    expect(result.value).toBeNull();
    expect(result.diagnostics[0]?.code).toBe(
      DiagnosticCodes.OVERRIDES_JSON_INVALID,
    );
  });
});
