import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { importJinxesJson, parseRichText } from "../../src/index.js";

const EXPECTED_OWNER_COUNT = 27;
const EXPECTED_PAIR_COUNT = 131;
const CYRILLIC_LETTER = /[А-Яа-яЁё]/u;
const OBVIOUS_ENGLISH_WORD =
  /\b(?:a|an|the|and|or|but|if|then|else|otherwise|when|while|after|before|during|until|each|every|both|either|neither|you|your|they|their|them|this|that|these|those|is|are|was|were|be|been|being|has|have|had|do|does|did|not|no|may|must|can|cannot|will|would|should|could|with|without|from|into|onto|for|of|to|at|by|player|players|ability|abilities|demon|minion|townsfolk|outsider|good|evil|alive|dead|drunk|poisoned|dies|died|kill|kills|killed|choose|chooses|chosen|learn|learns|tonight|tomorrow)\b/iu;

interface CatalogRole {
  readonly id?: unknown;
}

interface RawJinxEntry {
  readonly id?: unknown;
  readonly reason?: unknown;
  readonly translations?: {
    readonly ru?: unknown;
  };
}

interface RawJinxGroup {
  readonly id?: unknown;
  readonly jinx?: unknown;
}

const rolesPath = fileURLToPath(
  new URL("../../catalog/roles.ru.json", import.meta.url),
);
const jinxesPath = fileURLToPath(
  new URL("../../catalog/jinxes.ru.json", import.meta.url),
);
const rolesJson = readFileSync(rolesPath, "utf8");
const jinxesJson = readFileSync(jinxesPath, "utf8");
const parsedRoles = JSON.parse(rolesJson) as unknown;
const parsedJinxes = JSON.parse(jinxesJson) as unknown;
const roles = Array.isArray(parsedRoles) ? (parsedRoles as CatalogRole[]) : [];
const groups = Array.isArray(parsedJinxes)
  ? (parsedJinxes as RawJinxGroup[])
  : [];

describe("static Russian jinx catalog", () => {
  it("contains every official pair exactly once and only references known roles", () => {
    expect(Array.isArray(parsedRoles)).toBe(true);
    expect(Array.isArray(parsedJinxes)).toBe(true);
    expect(groups).toHaveLength(EXPECTED_OWNER_COUNT);

    const roleIds = new Set(
      roles.map((role) => role.id).filter(isNonBlankString),
    );
    const pairKeys: string[] = [];
    const problems: string[] = [];

    groups.forEach((group, groupIndex) => {
      const ownerId = group.id;
      if (!isNonBlankString(ownerId)) {
        problems.push(`group ${groupIndex}: invalid owner id`);
        return;
      }
      if (!roleIds.has(ownerId)) {
        problems.push(`${ownerId}: unknown owner role`);
      }
      if (!Array.isArray(group.jinx)) {
        problems.push(`${ownerId}: jinx is not an array`);
        return;
      }

      (group.jinx as RawJinxEntry[]).forEach((entry, entryIndex) => {
        const targetId = entry.id;
        if (!isNonBlankString(targetId)) {
          problems.push(`${ownerId}/jinx/${entryIndex}: invalid target id`);
          return;
        }
        if (!roleIds.has(targetId)) {
          problems.push(`${ownerId}:${targetId}: unknown target role`);
        }
        pairKeys.push(`${ownerId}:${targetId}`);
      });
    });

    expect(pairKeys).toHaveLength(EXPECTED_PAIR_COUNT);
    expect(new Set(pairKeys).size).toBe(EXPECTED_PAIR_COUNT);
    expect(problems).toEqual([]);
  });

  it("contains a genuine Russian translation for every pair", () => {
    const problems: string[] = [];

    forEachJinx((ownerId, entry, entryIndex) => {
      const pair = pairLabel(ownerId, entry, entryIndex);
      const reason = entry.reason;
      const translation = entry.translations?.ru;

      if (!isNonBlankString(translation)) {
        problems.push(`${pair}: missing translations.ru`);
        return;
      }
      if (!CYRILLIC_LETTER.test(translation)) {
        problems.push(`${pair}: translations.ru has no Cyrillic text`);
      }
      if (isNonBlankString(reason) && translation.trim() === reason.trim()) {
        problems.push(`${pair}: translations.ru equals reason`);
      }

      const visibleText = stripBbCode(translation);
      const englishMatch = OBVIOUS_ENGLISH_WORD.exec(visibleText);
      if (englishMatch !== null) {
        problems.push(
          `${pair}: English word "${englishMatch[0]}" remains in translations.ru`,
        );
      }
    });

    expect(problems).toEqual([]);
  });

  it("uses valid supported rich-text markup in every Russian translation", () => {
    const problems: string[] = [];

    forEachJinx((ownerId, entry, entryIndex) => {
      const pair = pairLabel(ownerId, entry, entryIndex);
      const translation = entry.translations?.ru;
      if (!isNonBlankString(translation)) {
        problems.push(`${pair}: missing translations.ru`);
        return;
      }

      const result = parseRichText(
        translation,
        `catalog:${pair}/translations/ru`,
      );
      if (result.value === null || result.diagnostics.length > 0) {
        problems.push(
          `${pair}: ${
            result.diagnostics
              .map((diagnostic) => diagnostic.code)
              .join(", ") || "parser returned no value"
          }`,
        );
      }
    });

    expect(problems).toEqual([]);
  });

  it("is accepted by the production jinx importer", () => {
    const result = importJinxesJson(jinxesJson, "catalog/jinxes.ru.json");

    expect(result.diagnostics).toEqual([]);
    expect(result.value?.entries).toHaveLength(EXPECTED_PAIR_COUNT);
  });
});

function forEachJinx(
  visit: (ownerId: string, entry: RawJinxEntry, entryIndex: number) => void,
): void {
  groups.forEach((group, groupIndex) => {
    const ownerId = isNonBlankString(group.id)
      ? group.id
      : `<invalid-owner-${groupIndex}>`;
    if (!Array.isArray(group.jinx)) return;
    (group.jinx as RawJinxEntry[]).forEach((entry, entryIndex) => {
      visit(ownerId, entry, entryIndex);
    });
  });
}

function pairLabel(
  ownerId: string,
  entry: RawJinxEntry,
  entryIndex: number,
): string {
  return `${ownerId}:${
    isNonBlankString(entry.id) ? entry.id : `<invalid-target-${entryIndex}>`
  }`;
}

function stripBbCode(value: string): string {
  return value.replace(/\[(?:\/?b|\/?color(?:=[^\]]*)?)\]/giu, " ");
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
