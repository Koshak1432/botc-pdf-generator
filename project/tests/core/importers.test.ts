import { describe, expect, it } from "vitest";
import {
  DiagnosticCodes,
  importOfficialCatalogJson,
  importScriptJson,
} from "../../src/index.js";

describe("script JSON importer", () => {
  it("imports metadata, references and inline homebrew roles", () => {
    const result = importScriptJson(
      JSON.stringify([
        { id: "_meta", name: "Test Script", author: "Ada" },
        "washerwoman",
        { id: "soldier" },
        {
          id: "oracle",
          name: "Oracle",
          team: "townsfolk",
          ability: "Each night, learn something.",
          saoGroup: "EACH_NIGHT",
        },
      ]),
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.value?.metadata.name).toBe("Test Script");
    expect(result.value?.roles.map((entry) => entry.kind)).toEqual([
      "reference",
      "reference",
      "inline",
    ]);
  });

  it("returns a partial model with precise diagnostics", () => {
    const result = importScriptJson(
      JSON.stringify(["soldier", 42, "???"]),
      "script.json",
    );

    expect(result.value?.roles).toHaveLength(1);
    expect(result.diagnostics.map((item) => item.code)).toEqual([
      DiagnosticCodes.SCRIPT_ELEMENT_UNSUPPORTED,
      DiagnosticCodes.ROLE_ID_INVALID,
    ]);
    expect(result.diagnostics[0]?.location?.jsonPointer).toBe("/1");
  });

  it("rejects a non-array root", () => {
    const result = importScriptJson("{}");

    expect(result.value).toBeNull();
    expect(result.diagnostics[0]?.code).toBe(
      DiagnosticCodes.SCRIPT_ROOT_NOT_ARRAY,
    );
  });
});

describe("official catalog importer", () => {
  it("keeps absolute official indices and derives official image URLs", () => {
    const result = importOfficialCatalogJson(
      JSON.stringify([
        null,
        {
          id: "soldier",
          name: "Soldier",
          team: "townsfolk",
          edition: "tb",
          ability: "You are safe from the Demon.",
        },
      ]),
    );

    const soldier = result.value?.get("soldier");
    expect(soldier?.saoBasis.officialIndex).toBe(1);
    expect(soldier?.image).toBe(
      "https://release.botc.app/resources/characters/tb/soldier_g.webp",
    );
  });

  it("keeps the first duplicate role", () => {
    const result = importOfficialCatalogJson(
      JSON.stringify([
        {
          id: "role",
          name: "First",
          team: "townsfolk",
          ability: "You are first.",
        },
        {
          id: "role",
          name: "Second",
          team: "townsfolk",
          ability: "You are second.",
        },
      ]),
    );

    expect(result.value?.get("role")?.canonicalText.name).toBe("First");
    expect(result.diagnostics.map((item) => item.code)).toContain(
      DiagnosticCodes.CATALOG_DUPLICATE_ID,
    );
  });

  it("supports image arrays and translations", () => {
    const result = importOfficialCatalogJson(
      JSON.stringify([
        {
          id: "role",
          name: "Role",
          team: "outsider",
          ability: "You are a role.",
          firstNightReminder: "Show the ROLE token.",
          otherNightReminder: "Mark the selected player.",
          image: ["local.webp", "fallback.webp"],
          translations: {
            ru: {
              name: "\u0420\u043E\u043B\u044C",
              ability:
                "\u0412\u044B \u044F\u0432\u043B\u044F\u0435\u0442\u0435\u0441\u044C \u0440\u043E\u043B\u044C\u044E.",
              firstNightReminder:
                "\u041F\u043E\u043A\u0430\u0436\u0438\u0442\u0435 \u0436\u0435\u0442\u043E\u043D \u0420\u041E\u041B\u0418.",
              otherNightReminder:
                "\u041E\u0442\u043C\u0435\u0442\u044C\u0442\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u0438\u0433\u0440\u043E\u043A\u0430.",
            },
          },
        },
      ]),
    );

    expect(result.value?.get("role")?.image).toBe("local.webp");
    expect(result.value?.get("role")?.translations.ru?.name).toBe(
      "\u0420\u043E\u043B\u044C",
    );
    expect(result.value?.get("role")?.translations.ru?.firstNightReminder).toBe(
      "\u041F\u043E\u043A\u0430\u0436\u0438\u0442\u0435 \u0436\u0435\u0442\u043E\u043D \u0420\u041E\u041B\u0418.",
    );
    expect(result.value?.get("role")?.translations.ru?.otherNightReminder).toBe(
      "\u041E\u0442\u043C\u0435\u0442\u044C\u0442\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u0438\u0433\u0440\u043E\u043A\u0430.",
    );
  });
});
