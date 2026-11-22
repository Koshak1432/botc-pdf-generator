import type { RoleCatalog } from "./catalog.js";
import {
  diagnostic,
  DiagnosticCodes,
  location,
  type Diagnostic,
} from "./diagnostics.js";
import {
  selectLocalizedJinxReason,
  type JinxData,
  type NightOrderData,
} from "./night-data.js";
import { importScriptJson } from "./script-importer.js";
import type {
  ActiveJinx,
  CoreResult,
  NightOrderItem,
  NightSheet,
  PlayerMemo,
  PresentationOverride,
  ResolvedRole,
  ResolvedScript,
  RichText,
  RoleCard,
  RoleSection,
} from "./model.js";
import { plainRichText } from "./model.js";
import { resolveScript } from "./resolver.js";
import { parseRichText } from "./rich-text.js";
import { classifySao, sortRolesBySao } from "./sao.js";

export interface CompileOptions {
  readonly sourceName?: string | null;
  readonly locale?: string;
  readonly overrides?: Readonly<Record<string, PresentationOverride>>;
}

export class MemoCompiler {
  readonly #catalog: RoleCatalog;
  readonly #catalogDiagnostics: readonly Diagnostic[];
  readonly #nightOrder: NightOrderData | null;
  readonly #jinxes: JinxData | null;

  constructor(
    catalog: RoleCatalog,
    catalogDiagnostics: readonly Diagnostic[] = [],
    nightOrder: NightOrderData | null = null,
    jinxes: JinxData | null = null,
  ) {
    this.#catalog = catalog;
    this.#catalogDiagnostics = [...catalogDiagnostics];
    this.#nightOrder = nightOrder;
    this.#jinxes = jinxes;
  }

  compile(
    scriptJson: string,
    options: CompileOptions = {},
  ): CoreResult<PlayerMemo> {
    const imported = importScriptJson(scriptJson, options.sourceName ?? null);
    if (imported.value === null) {
      return {
        value: null,
        diagnostics: [...this.#catalogDiagnostics, ...imported.diagnostics],
      };
    }
    const resolved = resolveScript(imported.value, this.#catalog, {
      locale: options.locale ?? "en",
      overrides: options.overrides ?? {},
    });
    if (resolved.value === null) {
      return {
        value: null,
        diagnostics: [
          ...this.#catalogDiagnostics,
          ...imported.diagnostics,
          ...resolved.diagnostics,
        ],
      };
    }
    const assembled = assemblePlayerMemo(resolved.value, {
      locale: options.locale ?? "en",
      nightOrder: this.#nightOrder,
      jinxes: this.#jinxes,
    });
    return {
      value: assembled.value,
      diagnostics: [
        ...this.#catalogDiagnostics,
        ...imported.diagnostics,
        ...resolved.diagnostics,
        ...assembled.diagnostics,
      ],
    };
  }
}

export interface AssemblePlayerMemoOptions {
  readonly locale?: string;
  readonly nightOrder?: NightOrderData | null;
  readonly jinxes?: JinxData | null;
}

export function assemblePlayerMemo(
  script: ResolvedScript,
  options: AssemblePlayerMemoOptions = {},
): CoreResult<PlayerMemo> {
  const diagnostics: Diagnostic[] = [];
  const sortedRoles = sortRolesBySao(script.roles);
  const bootleggerRules = parseBootleggerRules(script, diagnostics);
  const bootleggerAbility =
    bootleggerRules.length > 0 ? joinBootleggerRules(bootleggerRules) : null;
  const cards = sortedRoles.map((role) =>
    buildCard(
      role,
      diagnostics,
      role.definition.id === "bootlegger" ? bootleggerAbility : null,
    ),
  );
  const bootleggerCard = cards.find((card) => card.id === "bootlegger");
  const bootlegger =
    bootleggerRules.length > 0
      ? bootleggerRules
      : bootleggerCard
        ? [bootleggerCard.ability]
        : [];
  const sections: RoleSection[] = [];
  for (const card of cards) {
    const lastSection = sections.at(-1);
    if (lastSection?.team === card.team) {
      sections[sections.length - 1] = {
        team: lastSection.team,
        cards: [...lastSection.cards, card],
      };
    } else {
      sections.push({ team: card.team, cards: [card] });
    }
  }

  return {
    value: {
      title: script.metadata.name,
      author: script.metadata.author?.trim() ? script.metadata.author : null,
      logo: script.metadata.logo,
      background: script.metadata.background,
      sections,
      nightSheet: assembleNightSheet(script, options, diagnostics, bootlegger),
    },
    diagnostics,
  };
}

function parseBootleggerRules(
  script: ResolvedScript,
  diagnostics: Diagnostic[],
): readonly RichText[] {
  if (!script.roles.some((role) => role.definition.id === "bootlegger"))
    return [];
  return (script.metadata.bootlegger ?? []).map((rule, index) => {
    const parsed = parseRichText(rule, `_meta/bootlegger/${index}`);
    diagnostics.push(...parsed.diagnostics);
    return parsed.value ?? plainRichText(rule);
  });
}

function joinBootleggerRules(rules: readonly RichText[]): RichText {
  return {
    plainText: rules.map((rule) => rule.plainText).join("\n"),
    runs: rules.flatMap((rule, index) =>
      index === 0 ? rule.runs : [...plainRichText("\n").runs, ...rule.runs],
    ),
  };
}

function assembleNightSheet(
  script: ResolvedScript,
  options: AssemblePlayerMemoOptions,
  diagnostics: Diagnostic[],
  bootlegger: readonly RichText[],
): NightSheet | null {
  const nightOrder = options.nightOrder ?? null;
  const jinxData = options.jinxes ?? null;
  if (nightOrder === null || jinxData === null) return null;

  const activeRoleIds = new Set(script.roles.map((role) => role.definition.id));
  const filterOrder = (
    order: readonly NightOrderItem[],
  ): readonly NightOrderItem[] =>
    order.filter(
      (item) => item.kind === "marker" || activeRoleIds.has(item.roleId),
    );

  const jinxes: ActiveJinx[] = [];
  const seenPairs = new Set<string>();
  for (const definition of jinxData.entries) {
    const [firstRoleId, secondRoleId] = definition.roleIds;
    if (!activeRoleIds.has(firstRoleId) || !activeRoleIds.has(secondRoleId)) {
      continue;
    }
    const pairKey = [firstRoleId, secondRoleId].sort().join("\u0000");
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    const reasonMarkup = selectLocalizedJinxReason(
      definition,
      options.locale ?? "en",
    );
    const parsed = parseRichText(
      reasonMarkup,
      `${definition.sourceName ?? "jinxes"}${definition.jsonPointer}/reason`,
    );
    diagnostics.push(...parsed.diagnostics);
    jinxes.push({
      roleIds: definition.roleIds,
      reason: parsed.value ?? plainRichText(reasonMarkup),
    });
  }

  return {
    firstNight: filterOrder(nightOrder.firstNight),
    otherNight: filterOrder(nightOrder.otherNight),
    jinxes,
    bootlegger,
  };
}
function buildCard(
  role: ResolvedRole,
  diagnostics: Diagnostic[],
  customAbility: RichText | null = null,
): RoleCard {
  const id = role.definition.id;
  const nameSource = `role:${id}/name`;
  const abilitySource = `role:${id}/ability`;
  const firstNightReminder = parseRoleReminder(
    role.displayText.firstNightReminder ?? null,
    `role:${id}/firstNightReminder`,
    diagnostics,
  );
  const otherNightReminder = parseRoleReminder(
    role.displayText.otherNightReminder ?? null,
    `role:${id}/otherNightReminder`,
    diagnostics,
  );
  const nameMarkup = markupOrFallback(
    role.presentationOverride?.nameMarkup ?? null,
    role.displayText.name,
    nameSource,
    diagnostics,
  );
  const name = parseRichText(nameMarkup, nameSource);
  diagnostics.push(...name.diagnostics);
  let ability = customAbility;
  if (ability === null) {
    const abilityMarkup = markupOrFallback(
      role.presentationOverride?.abilityMarkup ?? null,
      role.displayText.ability,
      abilitySource,
      diagnostics,
    );
    const parsed = parseRichText(abilityMarkup, abilitySource);
    diagnostics.push(...parsed.diagnostics);
    ability = parsed.value ?? plainRichText(role.displayText.ability);
  }

  const basis = role.definition.saoBasis;
  if (
    basis.officialIndex === null &&
    basis.groupOverride === null &&
    classifySao(basis.canonicalAbility) === "FALLBACK"
  ) {
    diagnostics.push(
      diagnostic(
        DiagnosticCodes.SAO_FALLBACK_GROUP,
        "warning",
        `Homebrew role '${id}' did not match an SAO group; fallback ordering is used.`,
        location(`role:${id}/ability`),
      ),
    );
  }

  return {
    id,
    team: role.definition.team,
    name: name.value ?? plainRichText(role.displayText.name),
    ability,
    firstNightReminder,
    otherNightReminder,
    image: role.presentationOverride?.image ?? role.definition.image,
    edition: role.definition.edition,
  };
}

function parseRoleReminder(
  markup: string | null,
  source: string,
  diagnostics: Diagnostic[],
): RichText | null {
  if (markup === null || markup.trim().length === 0) return null;
  const parsed = parseRichText(markup, source);
  diagnostics.push(...parsed.diagnostics);
  return parsed.value ?? plainRichText(markup);
}

function markupOrFallback(
  override: string | null,
  fallback: string,
  source: string,
  diagnostics: Diagnostic[],
): string {
  if (override === null) return fallback;
  if (override.trim().length > 0) return override;
  diagnostics.push(
    diagnostic(
      DiagnosticCodes.PRESENTATION_TEXT_BLANK,
      "error",
      "Presentation text override must not be blank; localized text is used.",
      location(source),
    ),
  );
  return fallback;
}

export function richTextOrPlain(
  result: CoreResult<RichText>,
  fallback: string,
): RichText {
  return result.value ?? plainRichText(fallback);
}
