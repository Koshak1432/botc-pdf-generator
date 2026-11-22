import {
  diagnostic,
  DiagnosticCodes,
  location,
  type Diagnostic,
} from "./diagnostics.js";
import {
  isJsonObject,
  jsonErrorMessage,
  normalizeRoleId,
  type JsonObject,
} from "./json.js";
import {
  NIGHT_MARKER_IDS,
  type CoreResult,
  type NightMarkerId,
  type NightOrderItem,
} from "./model.js";

export interface NightOrderData {
  readonly firstNight: readonly NightOrderItem[];
  readonly otherNight: readonly NightOrderItem[];
}

export interface JinxDefinition {
  readonly roleIds: readonly [string, string];
  readonly reason: string;
  readonly translations: Readonly<Record<string, string>>;
  readonly sourceName: string | null;
  readonly jsonPointer: string;
}

export interface JinxData {
  readonly entries: readonly JinxDefinition[];
}

export function importNightOrderJson(
  input: string,
  sourceName: string | null = null,
): CoreResult<NightOrderData> {
  const parsed = parseJson(
    input,
    sourceName,
    DiagnosticCodes.NIGHT_ORDER_JSON_INVALID,
    "night-order",
  );
  if (parsed.value === null) {
    return { value: null, diagnostics: parsed.diagnostics };
  }
  if (!isJsonObject(parsed.value)) {
    return {
      value: null,
      diagnostics: [
        diagnostic(
          DiagnosticCodes.NIGHT_ORDER_ROOT_INVALID,
          "error",
          "Night-order root must be a JSON object.",
          location(sourceName, ""),
        ),
      ],
    };
  }

  const diagnostics: Diagnostic[] = [];
  const firstNight = parseNightOrderList(
    parsed.value,
    "firstNight",
    sourceName,
    diagnostics,
  );
  const otherNight = parseNightOrderList(
    parsed.value,
    "otherNight",
    sourceName,
    diagnostics,
  );
  return {
    value:
      firstNight === null || otherNight === null
        ? null
        : { firstNight, otherNight },
    diagnostics,
  };
}

export function importJinxesJson(
  input: string,
  sourceName: string | null = null,
): CoreResult<JinxData> {
  const parsed = parseJson(
    input,
    sourceName,
    DiagnosticCodes.JINXES_JSON_INVALID,
    "jinx",
  );
  if (parsed.value === null) {
    return { value: null, diagnostics: parsed.diagnostics };
  }
  if (!Array.isArray(parsed.value)) {
    return {
      value: null,
      diagnostics: [
        diagnostic(
          DiagnosticCodes.JINXES_ROOT_NOT_ARRAY,
          "error",
          "Official jinx catalog root must be a JSON array.",
          location(sourceName, ""),
        ),
      ],
    };
  }

  const diagnostics: Diagnostic[] = [];
  const entries: JinxDefinition[] = [];
  parsed.value.forEach((rawGroup, groupIndex) => {
    const groupPointer = `/${groupIndex}`;
    if (!isJsonObject(rawGroup)) {
      diagnostics.push(
        diagnostic(
          DiagnosticCodes.JINX_GROUP_INVALID,
          "error",
          "Jinx catalog element must be an object.",
          location(sourceName, groupPointer),
        ),
      );
      return;
    }

    const ownerId = parseJinxRoleId(
      rawGroup.id,
      sourceName,
      `${groupPointer}/id`,
      DiagnosticCodes.JINX_GROUP_INVALID,
      diagnostics,
    );
    if (!Array.isArray(rawGroup.jinx)) {
      diagnostics.push(
        diagnostic(
          DiagnosticCodes.JINX_GROUP_INVALID,
          "error",
          "Jinx catalog element requires an array field 'jinx'.",
          location(sourceName, `${groupPointer}/jinx`),
        ),
      );
      return;
    }
    if (ownerId === null) return;

    rawGroup.jinx.forEach((rawEntry, entryIndex) => {
      const entryPointer = `${groupPointer}/jinx/${entryIndex}`;
      if (!isJsonObject(rawEntry)) {
        diagnostics.push(
          diagnostic(
            DiagnosticCodes.JINX_ENTRY_INVALID,
            "error",
            "Jinx entry must be an object.",
            location(sourceName, entryPointer),
          ),
        );
        return;
      }
      const targetId = parseJinxRoleId(
        rawEntry.id,
        sourceName,
        `${entryPointer}/id`,
        DiagnosticCodes.JINX_ENTRY_INVALID,
        diagnostics,
      );
      const reason =
        typeof rawEntry.reason === "string" && rawEntry.reason.trim().length > 0
          ? rawEntry.reason
          : null;
      if (reason === null) {
        diagnostics.push(
          diagnostic(
            DiagnosticCodes.JINX_ENTRY_INVALID,
            "error",
            "Jinx entry requires a non-blank string field 'reason'.",
            location(sourceName, `${entryPointer}/reason`),
          ),
        );
      }
      const translations = parseJinxTranslations(
        rawEntry,
        sourceName,
        entryPointer,
        diagnostics,
      );
      if (targetId === null || reason === null) return;
      if (targetId === ownerId) {
        diagnostics.push(
          diagnostic(
            DiagnosticCodes.JINX_ENTRY_INVALID,
            "error",
            "A role cannot be jinxed with itself.",
            location(sourceName, `${entryPointer}/id`),
          ),
        );
        return;
      }
      entries.push({
        roleIds: [ownerId, targetId],
        reason,
        translations,
        sourceName,
        jsonPointer: entryPointer,
      });
    });
  });

  return { value: { entries }, diagnostics };
}

export function selectLocalizedJinxReason(
  definition: JinxDefinition,
  localeTag: string,
): string {
  const requested = localeTag.trim().replaceAll("_", "-");
  let candidate = requested;
  while (candidate.length > 0) {
    const match = Object.entries(definition.translations).find(
      ([tag]) =>
        tag
          .replaceAll("_", "-")
          .localeCompare(candidate, undefined, { sensitivity: "accent" }) === 0,
    );
    if (match !== undefined && match[1].trim().length > 0) return match[1];
    const separator = candidate.lastIndexOf("-");
    candidate = separator < 0 ? "" : candidate.slice(0, separator);
  }
  return definition.reason;
}

function parseNightOrderList(
  root: JsonObject,
  field: "firstNight" | "otherNight",
  sourceName: string | null,
  diagnostics: Diagnostic[],
): readonly NightOrderItem[] | null {
  const rawList = root[field];
  if (!Array.isArray(rawList)) {
    diagnostics.push(
      diagnostic(
        DiagnosticCodes.NIGHT_ORDER_FIELD_INVALID,
        "error",
        `Night-order field '${field}' must be an array.`,
        location(sourceName, `/${field}`),
      ),
    );
    return null;
  }

  const result: NightOrderItem[] = [];
  rawList.forEach((raw, index) => {
    const pointer = `/${field}/${index}`;
    if (typeof raw !== "string") {
      diagnostics.push(
        diagnostic(
          DiagnosticCodes.NIGHT_ORDER_ENTRY_INVALID,
          "error",
          "Night-order entry must be a role or marker id string.",
          location(sourceName, pointer),
        ),
      );
      return;
    }
    const id = normalizeRoleId(raw);
    if (id === null) {
      diagnostics.push(
        diagnostic(
          DiagnosticCodes.NIGHT_ORDER_ENTRY_INVALID,
          "error",
          `Invalid night-order id '${raw}'.`,
          location(sourceName, pointer),
        ),
      );
      return;
    }
    result.push(
      isNightMarkerId(id)
        ? { kind: "marker", id }
        : { kind: "role", roleId: id },
    );
  });
  return result;
}

function parseJinxTranslations(
  entry: JsonObject,
  sourceName: string | null,
  entryPointer: string,
  diagnostics: Diagnostic[],
): Readonly<Record<string, string>> {
  const raw = entry.translations;
  if (raw === undefined) return {};
  if (!isJsonObject(raw)) {
    diagnostics.push(
      diagnostic(
        DiagnosticCodes.JINX_ENTRY_INVALID,
        "error",
        "Jinx translations must be an object whose values are strings.",
        location(sourceName, `${entryPointer}/translations`),
      ),
    );
    return {};
  }

  const translations: Record<string, string> = {};
  for (const [localeTag, translation] of Object.entries(raw)) {
    if (typeof translation !== "string") {
      diagnostics.push(
        diagnostic(
          DiagnosticCodes.JINX_ENTRY_INVALID,
          "error",
          `Jinx translation '${localeTag}' must be a string.`,
          location(sourceName, `${entryPointer}/translations/${localeTag}`),
        ),
      );
      continue;
    }
    translations[localeTag] = translation;
  }
  return translations;
}

function parseJinxRoleId(
  raw: unknown,
  sourceName: string | null,
  pointer: string,
  code: string,
  diagnostics: Diagnostic[],
): string | null {
  if (typeof raw === "string") {
    const normalized = normalizeRoleId(raw);
    if (normalized !== null) return normalized;
  }
  diagnostics.push(
    diagnostic(
      code,
      "error",
      "Jinx role id must be a valid string id.",
      location(sourceName, pointer),
    ),
  );
  return null;
}

function isNightMarkerId(id: string): id is NightMarkerId {
  return NIGHT_MARKER_IDS.includes(id as NightMarkerId);
}

function parseJson(
  input: string,
  sourceName: string | null,
  code: string,
  label: string,
): CoreResult<unknown> {
  try {
    return { value: JSON.parse(input) as unknown, diagnostics: [] };
  } catch (error) {
    return {
      value: null,
      diagnostics: [
        diagnostic(
          code,
          "error",
          `Invalid ${label} JSON: ${jsonErrorMessage(error)}`,
          location(sourceName),
        ),
      ],
    };
  }
}
