import type { ResolvedRole, RoleTeam } from "./model.js";
import { getSaoGroup, SAO_GROUPS, type SaoGroupName } from "./sao-groups.js";

const TEAM_RANK: Readonly<Record<RoleTeam, number>> = {
  townsfolk: 0,
  outsider: 1,
  minion: 2,
  demon: 3,
  traveller: 4,
  fabled: 5,
  loric: 6,
};

interface DerivedRole {
  readonly role: ResolvedRole;
  readonly group: SaoGroupName;
  readonly canonicalName: string;
  readonly abilityLength: number;
  readonly nameLength: number;
}

const PREFIXES = SAO_GROUPS.filter((group) => group.phrase !== null).map(
  (group) => ({
    group: group.name,
    text: normalize(group.phrase as string),
    codePointLength: codePointLength(group.phrase as string),
  }),
);

const ENGLISH_COLLATOR = new Intl.Collator("en", {
  usage: "sort",
  sensitivity: "variant",
});

export function classifySao(canonicalAbility: string): SaoGroupName {
  const ability = normalize(canonicalAbility);
  let best: (typeof PREFIXES)[number] | null = null;
  for (const prefix of PREFIXES) {
    if (!matchesAtBoundary(ability, prefix.text)) continue;
    if (
      best === null ||
      prefix.codePointLength > best.codePointLength ||
      (prefix.codePointLength === best.codePointLength &&
        getSaoGroup(prefix.group).rank < getSaoGroup(best.group).rank)
    ) {
      best = prefix;
    }
  }
  return best?.group ?? "FALLBACK";
}

export function codePointLength(text: string): number {
  return [...normalize(text)].length;
}

export function sortRolesBySao(
  roles: Iterable<ResolvedRole>,
): readonly ResolvedRole[] {
  const byTeam = new Map<RoleTeam, ResolvedRole[]>();
  for (const role of roles) {
    const team = role.definition.team;
    const teamRoles = byTeam.get(team) ?? [];
    teamRoles.push(role);
    byTeam.set(team, teamRoles);
  }
  return [...byTeam.entries()]
    .sort(
      ([left], [right]) =>
        TEAM_RANK[left] - TEAM_RANK[right] || left.localeCompare(right),
    )
    .flatMap(([, teamRoles]) => sortWithinTeam(teamRoles));
}

function sortWithinTeam(
  roles: readonly ResolvedRole[],
): readonly ResolvedRole[] {
  const anchored = roles
    .filter(
      (role) =>
        role.definition.saoBasis.officialIndex !== null &&
        role.definition.saoBasis.groupOverride === null,
    )
    .sort(
      (left, right) =>
        (left.definition.saoBasis.officialIndex ?? 0) -
          (right.definition.saoBasis.officialIndex ?? 0) ||
        left.definition.id.localeCompare(right.definition.id),
    );
  const anchoredSet = new Set(anchored);
  const floating = roles
    .filter((role) => !anchoredSet.has(role))
    .map(derive)
    .sort(compareDerived)
    .map((item) => item.role);
  if (anchored.length === 0) return floating;
  if (floating.length === 0) return anchored;

  const merged = [...anchored];
  for (const role of floating) {
    const key = derive(role);
    const index = merged.findIndex(
      (existing) => compareDerived(key, derive(existing)) < 0,
    );
    if (index < 0) merged.push(role);
    else merged.splice(index, 0, role);
  }
  return merged;
}

function derive(role: ResolvedRole): DerivedRole {
  const basis = role.definition.saoBasis;
  const canonicalName = normalize(basis.canonicalName);
  const canonicalAbility = normalize(basis.canonicalAbility);
  return {
    role,
    group: basis.groupOverride ?? classifySao(canonicalAbility),
    canonicalName,
    abilityLength: codePointLength(canonicalAbility),
    nameLength: codePointLength(canonicalName),
  };
}

function compareDerived(left: DerivedRole, right: DerivedRole): number {
  let result = getSaoGroup(left.group).rank - getSaoGroup(right.group).rank;
  if (result === 0) result = left.abilityLength - right.abilityLength;
  if (result === 0) result = left.nameLength - right.nameLength;
  if (result === 0)
    result = ENGLISH_COLLATOR.compare(left.canonicalName, right.canonicalName);
  if (result === 0)
    result = left.role.definition.id.localeCompare(right.role.definition.id);
  return result;
}

function matchesAtBoundary(text: string, prefix: string): boolean {
  if (!text.startsWith(prefix)) return false;
  if (text.length === prefix.length) return true;
  const nextCodePoint = String.fromCodePoint(
    text.codePointAt(prefix.length) as number,
  );
  return !/[\p{L}\p{N}\p{M}\p{Pc}]/u.test(nextCodePoint);
}

function normalize(text: string): string {
  return text.normalize("NFC");
}
