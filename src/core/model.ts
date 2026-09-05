import type { Diagnostic, SourceLocation } from "./diagnostics.js";
import type { SaoGroupName } from "./sao-groups.js";

export const ROLE_TEAMS = [
  "townsfolk",
  "outsider",
  "minion",
  "demon",
  "traveller",
  "fabled",
  "loric",
] as const;

export type RoleTeam = (typeof ROLE_TEAMS)[number];

export interface RoleText {
  readonly name: string;
  readonly ability: string;
}

export interface SaoBasis {
  readonly canonicalName: string;
  readonly canonicalAbility: string;
  readonly officialIndex: number | null;
  readonly groupOverride: SaoGroupName | null;
}

export interface RoleDefinition {
  readonly id: string;
  readonly team: RoleTeam;
  readonly canonicalText: RoleText;
  readonly edition: string | null;
  readonly translations: Readonly<Record<string, RoleText>>;
  readonly image: string | null;
  readonly saoBasis: SaoBasis;
}

export interface PresentationOverride {
  readonly nameMarkup: string | null;
  readonly abilityMarkup: string | null;
  readonly image: string | null;
}

export interface ScriptMetadata {
  readonly name: string | null;
  readonly author: string | null;
  readonly logo: string | null;
  readonly background: string | null;
  readonly bootlegger?: readonly string[];
}

export type ScriptRoleEntry =
  | {
      readonly kind: "reference";
      readonly id: string;
      readonly sourceLocation: SourceLocation | null;
    }
  | {
      readonly kind: "inline";
      readonly id: string;
      readonly role: RoleDefinition;
      readonly sourceLocation: SourceLocation | null;
    };

export interface ScriptDocument {
  readonly metadata: ScriptMetadata;
  readonly roles: readonly ScriptRoleEntry[];
}

export interface ResolvedRole {
  readonly definition: RoleDefinition;
  readonly displayText: RoleText;
  readonly presentationOverride: PresentationOverride | null;
}

export interface ResolvedScript {
  readonly metadata: ScriptMetadata;
  readonly roles: readonly ResolvedRole[];
}

export interface TextStyle {
  readonly bold: boolean;
  readonly color: string | null;
}

export interface TextRun {
  readonly text: string;
  readonly style: TextStyle;
}

export interface RichText {
  readonly runs: readonly TextRun[];
  readonly plainText: string;
}

export interface RoleCard {
  readonly id: string;
  readonly team: RoleTeam;
  readonly name: RichText;
  readonly ability: RichText;
  readonly image: string | null;
  readonly edition: string | null;
}

export interface RoleSection {
  readonly team: RoleTeam;
  readonly cards: readonly RoleCard[];
}

export const NIGHT_MARKER_IDS = [
  "dusk",
  "minioninfo",
  "demoninfo",
  "dawn",
] as const;

export type NightMarkerId = (typeof NIGHT_MARKER_IDS)[number];

export type NightOrderItem =
  | { readonly kind: "role"; readonly roleId: string }
  | { readonly kind: "marker"; readonly id: NightMarkerId };

export interface ActiveJinx {
  readonly roleIds: readonly [string, string];
  readonly reason: RichText;
}

export interface NightSheet {
  readonly firstNight: readonly NightOrderItem[];
  readonly otherNight: readonly NightOrderItem[];
  readonly jinxes: readonly ActiveJinx[];
  readonly bootlegger?: readonly RichText[];
}

export interface PlayerMemo {
  readonly title: string | null;
  readonly author: string | null;
  readonly logo: string | null;
  readonly background: string | null;
  readonly sections: readonly RoleSection[];
  readonly nightSheet: NightSheet | null;
}

export interface CoreResult<T> {
  readonly value: T | null;
  readonly diagnostics: readonly Diagnostic[];
}

export function hasErrors(result: CoreResult<unknown>): boolean {
  return result.diagnostics.some((item) => item.severity === "error");
}

export function emptyMetadata(): ScriptMetadata {
  return {
    name: null,
    author: null,
    logo: null,
    background: null,
    bootlegger: [],
  };
}

export function plainRichText(text: string): RichText {
  const runs: readonly TextRun[] =
    text.length === 0 ? [] : [{ text, style: { bold: false, color: null } }];
  return { runs, plainText: text };
}
