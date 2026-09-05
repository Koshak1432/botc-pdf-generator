import { readFile } from "node:fs/promises";

import { beforeAll, describe, expect, it } from "vitest";
import {
  createMemoCompiler,
  type MemoCompiler,
  type PlayerMemo,
} from "../../src/index.js";

const EXPECTED_ORDER = [
  "general",
  "villageidiot",
  "towncrier",
  "innkeeper",
  "gambler",
  "exorcist",
  "nightwatchman",
  "slayer",
  "fisherman",
  "soldier",
  "cannibal",
  "amnesiac",
  "minstrel",
  "drunk",
  "golem",
  "politician",
  "damsel",
  "godfather",
  "assassin",
  "summoner",
  "scarletwoman",
  "yaggababble",
  "pukka",
  "ojo",
  "po",
];

describe("A Grimm Chorus integration", () => {
  let compiler: MemoCompiler;
  let scriptJson: string;

  beforeAll(async () => {
    const [loadedScriptJson, catalogJson, nightOrderJson, jinxesJson] =
      await Promise.all([
        readFile(
          new URL("../../examples/a-grimm-chorus.json", import.meta.url),
          "utf8",
        ),
        readFile(
          new URL("../../catalog/roles.ru.json", import.meta.url),
          "utf8",
        ),
        readFile(
          new URL("../../catalog/nightsheet.json", import.meta.url),
          "utf8",
        ),
        readFile(
          new URL("../../catalog/jinxes.ru.json", import.meta.url),
          "utf8",
        ),
      ]);
    scriptJson = loadedScriptJson;
    const result = createMemoCompiler(catalogJson, {
      sourceName: "roles.ru.json",
      nightOrderJson,
      nightOrderSourceName: "nightsheet.json",
      jinxesJson,
      jinxesSourceName: "jinxes.ru.json",
    });
    if (result.value === null)
      throw new Error("Fixture catalogs did not compile");
    compiler = result.value;
  });

  it("produces the exact official catalog order and sections", () => {
    const result = compiler.compile(scriptJson, { sourceName: "script.json" });
    const ids = flattenIds(result.value);

    expect(result.diagnostics).toEqual([]);
    expect(result.value?.title).toBe("A Grimm Chorus");
    expect(result.value?.author).toBeNull();
    expect(ids).toEqual(EXPECTED_ORDER);
    expect(
      ids.slice(ids.indexOf("cannibal"), ids.indexOf("minstrel") + 1),
    ).toEqual(["cannibal", "amnesiac", "minstrel"]);
    expect(ids.indexOf("amnesiac")).toBeGreaterThan(ids.indexOf("exorcist"));
    expect(
      result.value?.sections.map((section) => [
        section.team,
        section.cards.length,
      ]),
    ).toEqual([
      ["townsfolk", 13],
      ["outsider", 4],
      ["minion", 4],
      ["demon", 4],
    ]);
  });

  it("builds the scenario night order and includes only active jinxes", () => {
    const result = compiler.compile(scriptJson, { sourceName: "script.json" });
    const toIds = (
      items: NonNullable<PlayerMemo["nightSheet"]>["firstNight"],
    ): readonly string[] =>
      items.map((item) => (item.kind === "role" ? item.roleId : item.id));

    expect(toIds(result.value?.nightSheet?.firstNight ?? [])).toEqual([
      "dusk",
      "yaggababble",
      "minioninfo",
      "summoner",
      "demoninfo",
      "godfather",
      "pukka",
      "damsel",
      "amnesiac",
      "villageidiot",
      "nightwatchman",
      "general",
      "dawn",
    ]);
    expect(toIds(result.value?.nightSheet?.otherNight ?? [])).toEqual([
      "dusk",
      "innkeeper",
      "gambler",
      "scarletwoman",
      "summoner",
      "exorcist",
      "pukka",
      "po",
      "ojo",
      "yaggababble",
      "assassin",
      "godfather",
      "damsel",
      "amnesiac",
      "towncrier",
      "villageidiot",
      "nightwatchman",
      "general",
      "dawn",
    ]);
    expect(
      result.value?.nightSheet?.jinxes.map((jinx) => jinx.roleIds),
    ).toEqual([
      ["summoner", "pukka"],
      ["yaggababble", "exorcist"],
    ]);
  });
  it("applies presentation markup without changing ordering", () => {
    const result = compiler.compile(scriptJson, {
      overrides: {
        general: {
          nameMarkup: null,
          abilityMarkup:
            "[b]Each night[/b], learn whether [color=#c00000]good or evil[/color] is winning.",
          image: null,
        },
      },
    });
    const general = result.value?.sections[0]?.cards[0];

    expect(flattenIds(result.value)).toEqual(EXPECTED_ORDER);
    expect(general?.ability.runs).toEqual([
      { text: "Each night", style: { bold: true, color: null } },
      { text: ", learn whether ", style: { bold: false, color: null } },
      { text: "good or evil", style: { bold: false, color: "#C00000" } },
      { text: " is winning.", style: { bold: false, color: null } },
    ]);
  });
});

function flattenIds(memo: PlayerMemo | null | undefined): readonly string[] {
  return (
    memo?.sections.flatMap((section) => section.cards.map((card) => card.id)) ??
    []
  );
}
