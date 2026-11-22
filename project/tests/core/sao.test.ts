import { describe, expect, it } from "vitest";
import {
  classifySao,
  codePointLength,
  InMemoryRoleCatalog,
  resolveScript,
  SAO_GROUPS,
  sortRolesBySao,
  type RoleDefinition,
  type ScriptDocument,
} from "../../src/index.js";

describe("SAO", () => {
  it("classifies every documented opening phrase", () => {
    for (const group of SAO_GROUPS) {
      if (group.phrase === null) continue;
      expect(classifySao(group.phrase), group.name).toBe(group.name);
    }
  });

  it("chooses the longest prefix and respects word boundaries", () => {
    expect(classifySao("Each night*, choose a player.")).toBe(
      "EACH_NIGHT_STAR",
    );
    expect(classifySao("If the Demon dies, you win.")).toBe("IF_DEMON_DIES");
    expect(classifySao("Younger players win.")).toBe("FALLBACK");
    expect(classifySao("each night, choose a player.")).toBe("FALLBACK");
  });

  it("uses the opening SAO phrase when a later sentence names another group", () => {
    expect(
      classifySao(
        "You do not know what your ability is. Each day, privately guess what it is.",
      ),
    ).toBe("YOU_DO_NOT_KNOW");
  });

  it("counts normalized Unicode code points", () => {
    expect(codePointLength("e\u0301")).toBe(1);
    expect(codePointLength("\u{1F600}a")).toBe(2);
  });

  it("sorts teams and keeps official roles anchored", () => {
    const officialA = role("official-a", "townsfolk", "You are A.", 5);
    const officialB = role("official-b", "townsfolk", "Each night, B.", 9);
    const outsider = role("outsider", "outsider", "You are outside.", 1);
    const script: ScriptDocument = {
      metadata: { name: null, author: null, logo: null, background: null },
      roles: [outsider, officialB, officialA].map((definition) => ({
        kind: "inline" as const,
        id: definition.id,
        role: definition,
        sourceLocation: null,
      })),
    };
    const resolved = resolveScript(script, new InMemoryRoleCatalog([]));
    const sorted = sortRolesBySao(resolved.value?.roles ?? []);

    expect(sorted.map((item) => item.definition.id)).toEqual([
      "official-a",
      "official-b",
      "outsider",
    ]);
  });

  it("sorts unanchored fallback roles by canonical ability length", () => {
    const longest = role(
      "longest",
      "townsfolk",
      "Nothing unusual happens to this character.",
      null,
    );
    const shortest = role("shortest", "townsfolk", "Nothing.", null);
    const middle = role(
      "middle",
      "townsfolk",
      "Nothing unusual happens.",
      null,
    );
    const script: ScriptDocument = {
      metadata: { name: null, author: null, logo: null, background: null },
      roles: [longest, shortest, middle].map((definition) => ({
        kind: "inline" as const,
        id: definition.id,
        role: definition,
        sourceLocation: null,
      })),
    };
    const resolved = resolveScript(script, new InMemoryRoleCatalog([]));
    const sorted = sortRolesBySao(resolved.value?.roles ?? []);

    expect(
      [shortest, middle, longest].map((definition) =>
        codePointLength(definition.saoBasis.canonicalAbility),
      ),
    ).toEqual([8, 24, 42]);
    expect(sorted.map((item) => item.definition.id)).toEqual([
      "shortest",
      "middle",
      "longest",
    ]);
  });
});

function role(
  id: string,
  team: RoleDefinition["team"],
  ability: string,
  officialIndex: number | null,
): RoleDefinition {
  return {
    id,
    team,
    canonicalText: { name: id, ability },
    edition: null,
    translations: {},
    image: null,
    saoBasis: {
      canonicalName: id,
      canonicalAbility: ability,
      officialIndex,
      groupOverride: null,
    },
  };
}
