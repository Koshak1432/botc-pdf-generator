export const SAO_GROUPS = [
  { name: "YOU_START_KNOWING", rank: 0, phrase: "You start knowing" },
  { name: "AT_NIGHT", rank: 1, phrase: "At night" },
  { name: "EACH_DUSK_STAR", rank: 2, phrase: "Each dusk*" },
  { name: "EACH_NIGHT", rank: 3, phrase: "Each night" },
  { name: "EACH_NIGHT_STAR", rank: 4, phrase: "Each night*" },
  { name: "EACH_DAY", rank: 5, phrase: "Each day" },
  {
    name: "ONCE_PER_GAME_AT_NIGHT",
    rank: 6,
    phrase: "Once per game, at night",
  },
  {
    name: "ONCE_PER_GAME_AT_NIGHT_STAR",
    rank: 7,
    phrase: "Once per game, at night*",
  },
  {
    name: "ONCE_PER_GAME_DURING_DAY",
    rank: 8,
    phrase: "Once per game, during the day",
  },
  { name: "ONCE_PER_GAME", rank: 9, phrase: "Once per game" },
  { name: "ON_FIRST_NIGHT", rank: 10, phrase: "On your 1st night" },
  { name: "ON_FIRST_DAY", rank: 11, phrase: "On your 1st day" },
  { name: "YOU_THINK", rank: 12, phrase: "You think" },
  { name: "YOU_ARE", rank: 13, phrase: "You are" },
  { name: "YOU_HAVE", rank: 14, phrase: "You have" },
  { name: "YOU_DO_NOT_KNOW", rank: 15, phrase: "You do not know" },
  { name: "YOU_MIGHT", rank: 16, phrase: "You might" },
  { name: "YOU", rank: 17, phrase: "You" },
  { name: "WHEN_YOU_DIE", rank: 18, phrase: "When you die" },
  {
    name: "WHEN_YOU_LEARN_YOU_DIED",
    rank: 19,
    phrase: "When you learn that you died",
  },
  { name: "WHEN", rank: 20, phrase: "When" },
  { name: "IF_YOU_DIE", rank: 21, phrase: "If you die" },
  { name: "IF_YOU_DIED", rank: 22, phrase: "If you died" },
  { name: "IF_YOU_ARE_MAD", rank: 23, phrase: "If you are \u201Cmad\u201D" },
  { name: "IF_YOU", rank: 24, phrase: "If you" },
  { name: "IF_DEMON_DIES", rank: 25, phrase: "If the Demon dies" },
  { name: "IF_DEMON_KILLS", rank: 26, phrase: "If the Demon kills" },
  { name: "IF_DEMON", rank: 27, phrase: "If the Demon" },
  { name: "IF_BOTH", rank: 28, phrase: "If both" },
  {
    name: "IF_FIVE_OR_MORE_ALIVE",
    rank: 29,
    phrase: "If there are 5 or more players alive",
  },
  { name: "IF", rank: 30, phrase: "If" },
  { name: "ALL_PLAYERS", rank: 31, phrase: "All players" },
  { name: "ALL", rank: 32, phrase: "All" },
  { name: "THE_FIRST_TIME", rank: 33, phrase: "The 1st time" },
  { name: "THE", rank: 34, phrase: "The" },
  { name: "GOOD", rank: 35, phrase: "Good" },
  { name: "EVIL", rank: 36, phrase: "Evil" },
  { name: "PLAYERS", rank: 37, phrase: "Players" },
  { name: "MINIONS", rank: 38, phrase: "Minions" },
  { name: "FALLBACK", rank: 39, phrase: null },
] as const;

export type SaoGroupName = (typeof SAO_GROUPS)[number]["name"];
export type SaoGroup = (typeof SAO_GROUPS)[number];

export function getSaoGroup(name: SaoGroupName): SaoGroup {
  const group = SAO_GROUPS.find((candidate) => candidate.name === name);
  if (group === undefined) {
    throw new Error(`Unknown SAO group: ${name}`);
  }
  return group;
}

export function parseSaoGroup(rawValue: string): SaoGroupName | null {
  const raw = rawValue.trim();
  const normalizedName = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (
    SAO_GROUPS.find(
      (candidate) =>
        candidate.phrase === raw || candidate.name === normalizedName,
    )?.name ?? null
  );
}
