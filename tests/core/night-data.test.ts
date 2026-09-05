import { describe, expect, it } from "vitest";

import {
  DiagnosticCodes,
  createMemoCompiler,
  importJinxesJson,
  importNightOrderJson,
} from "../../src/index.js";

describe("night data importers", () => {
  it("imports role entries and all four structural markers", () => {
    const result = importNightOrderJson(
      JSON.stringify({
        firstNight: ["dusk", "alpha", "minioninfo", "demoninfo", "dawn"],
        otherNight: ["dusk", "alpha", "dawn"],
      }),
      "nightsheet.json",
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.value?.firstNight).toEqual([
      { kind: "marker", id: "dusk" },
      { kind: "role", roleId: "alpha" },
      { kind: "marker", id: "minioninfo" },
      { kind: "marker", id: "demoninfo" },
      { kind: "marker", id: "dawn" },
    ]);
  });

  it("validates malformed order fields and jinx translation values", () => {
    const order = importNightOrderJson(
      JSON.stringify({ firstNight: "dusk", otherNight: [] }),
      "nightsheet.json",
    );
    const jinxes = importJinxesJson(
      JSON.stringify([
        {
          id: "alpha",
          jinx: [
            {
              id: "beta",
              reason: "Reason.",
              translations: { ru: 42 },
            },
          ],
        },
      ]),
      "jinxes.json",
    );

    expect(order.value).toBeNull();
    expect(order.diagnostics[0]?.code).toBe(
      DiagnosticCodes.NIGHT_ORDER_FIELD_INVALID,
    );
    expect(order.diagnostics[0]?.location?.jsonPointer).toBe("/firstNight");
    expect(jinxes.diagnostics[0]?.code).toBe(
      DiagnosticCodes.JINX_ENTRY_INVALID,
    );
    expect(jinxes.diagnostics[0]?.location?.jsonPointer).toBe(
      "/0/jinx/0/translations/ru",
    );
  });
});

describe("night-sheet assembly", () => {
  it("filters inactive roles, localizes rich jinx text and deduplicates pairs", () => {
    const catalogJson = JSON.stringify([
      {
        id: "alpha",
        name: "Alpha",
        team: "townsfolk",
        ability: "You are Alpha.",
      },
      {
        id: "beta",
        name: "Beta",
        team: "minion",
        ability: "You are Beta.",
      },
      {
        id: "travellerx",
        name: "Traveller X",
        team: "traveller",
        ability: "You travel.",
      },
    ]);
    const nightOrderJson = JSON.stringify({
      firstNight: [
        "dusk",
        "travellerx",
        "alpha",
        "minioninfo",
        "beta",
        "demoninfo",
        "dawn",
      ],
      otherNight: ["dusk", "minioninfo", "alpha", "demoninfo", "beta", "dawn"],
    });
    const jinxesJson = JSON.stringify([
      {
        id: "alpha",
        jinx: [
          {
            id: "beta",
            reason: "English text.",
            translations: { ru: "[b]Русский[/b] текст." },
          },
        ],
      },
      {
        id: "beta",
        jinx: [{ id: "alpha", reason: "Duplicate reverse pair." }],
      },
      {
        id: "travellerx",
        jinx: [{ id: "alpha", reason: "Inactive traveller." }],
      },
    ]);
    const compilerResult = createMemoCompiler(catalogJson, {
      nightOrderJson,
      jinxesJson,
    });
    const memo = compilerResult.value?.compile(
      JSON.stringify([{ id: "_meta", name: "Test" }, "alpha", "beta"]),
      { locale: "ru" },
    ).value;

    expect(
      memo?.nightSheet?.firstNight.map((item) =>
        item.kind === "role" ? item.roleId : item.id,
      ),
    ).toEqual(["dusk", "alpha", "minioninfo", "beta", "demoninfo", "dawn"]);
    expect(memo?.nightSheet?.jinxes).toHaveLength(1);
    expect(memo?.nightSheet?.jinxes[0]?.roleIds).toEqual(["alpha", "beta"]);
    expect(memo?.nightSheet?.jinxes[0]?.reason.plainText).toBe(
      "Русский текст.",
    );
    expect(memo?.nightSheet?.jinxes[0]?.reason.runs[0]?.style.bold).toBe(true);
  });

  it("leaves nightSheet null when bundled data is not supplied", () => {
    const compiler = createMemoCompiler(
      JSON.stringify([
        {
          id: "alpha",
          name: "Alpha",
          team: "townsfolk",
          ability: "You are Alpha.",
        },
      ]),
    ).value;
    const memo = compiler?.compile(JSON.stringify(["alpha"])).value;

    expect(memo?.nightSheet).toBeNull();
  });
});
