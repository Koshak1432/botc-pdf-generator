import { describe, expect, it } from "vitest";
import { DiagnosticCodes, parseRichText } from "../../src/index.js";

describe("parseRichText", () => {
  it("parses nested bold and color markup", () => {
    const result = parseRichText(
      "Plain [b]bold [color=#c00000]and red[/color][/b].",
      "test",
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.value?.plainText).toBe("Plain bold and red.");
    expect(result.value?.runs).toEqual([
      { text: "Plain ", style: { bold: false, color: null } },
      { text: "bold ", style: { bold: true, color: null } },
      { text: "and red", style: { bold: true, color: "#C00000" } },
      { text: ".", style: { bold: false, color: null } },
    ]);
  });

  it("keeps native BOTC brackets as ordinary text", () => {
    const result = parseRichText("Choose a player. [+1 Outsider]");

    expect(result.value?.plainText).toBe("Choose a player. [+1 Outsider]");
    expect(result.diagnostics).toEqual([]);
  });

  it("parses formatting nested inside native BOTC brackets", () => {
    const result = parseRichText("[-1 or +1 [color=#3297F4]Outsider[/color]]");

    expect(result.diagnostics).toEqual([]);
    expect(result.value?.plainText).toBe("[-1 or +1 Outsider]");
    expect(result.value?.runs).toEqual([
      { text: "[-1 or +1 ", style: { bold: false, color: null } },
      { text: "Outsider", style: { bold: false, color: "#3297F4" } },
      { text: "]", style: { bold: false, color: null } },
    ]);
  });

  it("keeps an invalid color tag visible", () => {
    const result = parseRichText("[color=red]visible[/color]");

    expect(result.value?.plainText).toBe("[color=red]visible[/color]");
    expect(result.diagnostics.map((item) => item.code)).toContain(
      DiagnosticCodes.MARKUP_INVALID_COLOR,
    );
  });

  it("recovers from a mismatched closing tag without leaking styles", () => {
    const result = parseRichText("[b]bold[color=#ff0000]red[/b] plain");

    expect(result.diagnostics.map((item) => item.code)).toContain(
      DiagnosticCodes.MARKUP_MISMATCHED_TAG,
    );
    expect(result.value?.runs.at(-1)).toEqual({
      text: " plain",
      style: { bold: false, color: null },
    });
  });

  it("reports unclosed tags", () => {
    const result = parseRichText("[b]bold");

    expect(result.value?.plainText).toBe("bold");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe(
      DiagnosticCodes.MARKUP_UNCLOSED_TAG,
    );
  });

  it("merges neighboring runs with the same effective style", () => {
    const result = parseRichText("[b]one[color=#112233][/color]two[/b]");

    expect(result.value?.runs).toEqual([
      { text: "onetwo", style: { bold: true, color: null } },
    ]);
  });

  it("returns no runs for an empty string", () => {
    const result = parseRichText("");

    expect(result.value).toEqual({ runs: [], plainText: "" });
  });
});
