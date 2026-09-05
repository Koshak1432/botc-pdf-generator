import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseRichText } from "../../src/index.js";

const EXPECTED_TEAM_BLOCKS = [
  ["townsfolk", 69],
  ["outsider", 23],
  ["minion", 27],
  ["demon", 19],
  ["traveller", 18],
  ["fabled", 14],
  ["loric", 11],
] as const;

interface RussianTranslation {
  readonly name?: unknown;
  readonly ability?: unknown;
  readonly team?: unknown;
  readonly reminders?: unknown;
  readonly firstNightReminder?: unknown;
  readonly otherNightReminder?: unknown;
  readonly remindersGlobal?: unknown;
}

interface CatalogRole {
  readonly id?: unknown;
  readonly team?: unknown;
  readonly reminders?: unknown;
  readonly firstNightReminder?: unknown;
  readonly otherNightReminder?: unknown;
  readonly remindersGlobal?: unknown;
  readonly flavor?: unknown;
  readonly translations?: {
    readonly ru?: RussianTranslation;
  };
}

const catalogPath = fileURLToPath(
  new URL("../../catalog/roles.ru.json", import.meta.url),
);
const parsedCatalog = JSON.parse(readFileSync(catalogPath, "utf8")) as unknown;
const roles = Array.isArray(parsedCatalog)
  ? (parsedCatalog as CatalogRole[])
  : [];

describe("static Russian role catalog", () => {
  it("contains all unique roles in the official team blocks", () => {
    expect(Array.isArray(parsedCatalog)).toBe(true);
    expect(roles).toHaveLength(181);

    const ids = roles.map((role) => role.id);
    expect(ids.every(isNonBlankString)).toBe(true);
    expect(new Set(ids).size).toBe(181);

    const actualBlocks: Array<{ team: unknown; count: number }> = [];
    for (const role of roles) {
      const previous = actualBlocks.at(-1);
      if (previous?.team === role.team) previous.count += 1;
      else actualBlocks.push({ team: role.team, count: 1 });
    }

    expect(actualBlocks).toEqual(
      EXPECTED_TEAM_BLOCKS.map(([team, count]) => ({ team, count })),
    );
  });

  it("contains complete Russian text and no flavor", () => {
    const problems: string[] = [];

    for (const role of roles) {
      const id = isNonBlankString(role.id) ? role.id : "<invalid-id>";
      if (Object.hasOwn(role, "flavor")) problems.push(`${id}: flavor`);

      const translation = role.translations?.ru;
      if (translation === undefined) {
        problems.push(`${id}: translations.ru`);
        continue;
      }

      for (const field of ["name", "ability", "team"] as const) {
        if (!isNonBlankString(translation[field])) {
          problems.push(`${id}: translations.ru.${field}`);
        }
      }

      const sourceReminders = stringArray(role.reminders);
      const translatedReminders = stringArray(translation.reminders);
      if (
        sourceReminders === null ||
        translatedReminders === null ||
        translatedReminders.length !== sourceReminders.length ||
        translatedReminders.some((value) => value.trim().length === 0)
      ) {
        problems.push(`${id}: translations.ru.reminders`);
      }

      validateOptionalStringTranslation(
        role,
        translation,
        "firstNightReminder",
        id,
        problems,
      );
      validateOptionalStringTranslation(
        role,
        translation,
        "otherNightReminder",
        id,
        problems,
      );
      validateOptionalArrayTranslation(
        role,
        translation,
        "remindersGlobal",
        id,
        problems,
      );
    }

    expect(problems).toEqual([]);
  });

  it("uses valid supported rich-text markup in every Russian ability", () => {
    const problems: string[] = [];

    for (const role of roles) {
      const id = isNonBlankString(role.id) ? role.id : "<invalid-id>";
      const ability = role.translations?.ru?.ability;
      if (!isNonBlankString(ability)) {
        problems.push(`${id}: missing ability`);
        continue;
      }

      const result = parseRichText(
        ability,
        `catalog:${id}/translations/ru/ability`,
      );
      if (result.value === null || result.diagnostics.length > 0) {
        problems.push(
          `${id}: ${
            result.diagnostics
              .map((diagnostic) => diagnostic.code)
              .join(", ") || "parser returned no value"
          }`,
        );
      }
    }

    expect(problems).toEqual([]);
  });
});

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
}

function validateOptionalStringTranslation(
  role: CatalogRole,
  translation: RussianTranslation,
  field: "firstNightReminder" | "otherNightReminder",
  id: string,
  problems: string[],
): void {
  if (!Object.hasOwn(role, field)) return;

  const source = role[field];
  const translated = translation[field];
  if (
    typeof source !== "string" ||
    typeof translated !== "string" ||
    (source.trim().length > 0 && translated.trim().length === 0)
  ) {
    problems.push(`${id}: translations.ru.${field}`);
  }
}

function validateOptionalArrayTranslation(
  role: CatalogRole,
  translation: RussianTranslation,
  field: "remindersGlobal",
  id: string,
  problems: string[],
): void {
  if (!Object.hasOwn(role, field)) return;

  const source = stringArray(role[field]);
  const translated = stringArray(translation[field]);
  if (
    source === null ||
    translated === null ||
    translated.length !== source.length ||
    translated.some((value) => value.trim().length === 0)
  ) {
    problems.push(`${id}: translations.ru.${field}`);
  }
}
