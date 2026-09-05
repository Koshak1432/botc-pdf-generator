import {
  diagnostic,
  DiagnosticCodes,
  location,
  type Diagnostic,
} from "./diagnostics.js";
import {
  escapeJsonPointer,
  type JsonObject,
  normalizeRoleId,
  parseRoleTeam,
} from "./json.js";
import type { CoreResult, RoleDefinition, RoleText } from "./model.js";
import { parseSaoGroup, type SaoGroupName } from "./sao-groups.js";

export interface DecodeRoleOptions {
  readonly sourceName: string | null;
  readonly pointer: string;
  readonly invalidCode: string;
  readonly officialIndex: number | null;
}

export function decodeRoleDefinition(
  value: JsonObject,
  options: DecodeRoleOptions,
): CoreResult<RoleDefinition> {
  const diagnostics: Diagnostic[] = [];
  const { sourceName, pointer, invalidCode, officialIndex } = options;

  const rawId = requiredString(value, "id", options, diagnostics);
  const id = rawId === null ? null : normalizeRoleId(rawId);
  if (rawId !== null && id === null) {
    diagnostics.push(
      diagnostic(
        DiagnosticCodes.ROLE_ID_INVALID,
        "error",
        `Role id '${rawId}' must contain only lowercase letters, digits, '-' or '_'.`,
        location(sourceName, `${pointer}/id`),
      ),
    );
  }

  const rawName = requiredString(value, "name", options, diagnostics);
  const name = nonBlankRequired(rawName, "name", options, diagnostics);
  const rawAbility = requiredString(value, "ability", options, diagnostics);
  const ability = nonBlankRequired(rawAbility, "ability", options, diagnostics);

  const rawTeam = requiredString(value, "team", options, diagnostics);
  const team = rawTeam === null ? null : parseRoleTeam(rawTeam);
  if (rawTeam !== null && team === null) {
    diagnostics.push(
      invalidField(
        invalidCode,
        `Unknown role team '${rawTeam}'.`,
        sourceName,
        `${pointer}/team`,
      ),
    );
  }

  const rawEdition = optionalString(value, "edition", options, diagnostics);
  const edition =
    rawEdition !== null && rawEdition.trim().length > 0 ? rawEdition : null;
  const image = parseImage(
    value.image,
    sourceName,
    `${pointer}/image`,
    invalidCode,
    diagnostics,
  );
  const translations = parseTranslations(
    value.translations,
    sourceName,
    `${pointer}/translations`,
    invalidCode,
    diagnostics,
  );
  const groupOverride = parseGroupOverride(
    value.saoGroup,
    sourceName,
    `${pointer}/saoGroup`,
    diagnostics,
  );

  if (id === null || name === null || ability === null || team === null) {
    return { value: null, diagnostics };
  }

  const canonicalText: RoleText = { name, ability };
  return {
    value: {
      id,
      team,
      canonicalText,
      edition,
      translations,
      image,
      saoBasis: {
        canonicalName: name,
        canonicalAbility: ability,
        officialIndex,
        groupOverride,
      },
    },
    diagnostics,
  };
}

function requiredString(
  value: JsonObject,
  field: string,
  options: DecodeRoleOptions,
  diagnostics: Diagnostic[],
): string | null {
  const element = value[field];
  if (element === undefined) {
    diagnostics.push(
      invalidField(
        options.invalidCode,
        `Role is missing required string field '${field}'.`,
        options.sourceName,
        `${options.pointer}/${field}`,
      ),
    );
    return null;
  }
  if (typeof element !== "string") {
    diagnostics.push(
      invalidField(
        options.invalidCode,
        `Role field '${field}' must be a string.`,
        options.sourceName,
        `${options.pointer}/${field}`,
      ),
    );
    return null;
  }
  return element;
}

function nonBlankRequired(
  value: string | null,
  field: string,
  options: DecodeRoleOptions,
  diagnostics: Diagnostic[],
): string | null {
  if (value === null || value.trim().length > 0) {
    return value;
  }
  diagnostics.push(
    invalidField(
      options.invalidCode,
      `Role field '${field}' must not be blank.`,
      options.sourceName,
      `${options.pointer}/${field}`,
    ),
  );
  return null;
}

function optionalString(
  value: JsonObject,
  field: string,
  options: DecodeRoleOptions,
  diagnostics: Diagnostic[],
): string | null {
  const element = value[field];
  if (element === undefined) return null;
  if (typeof element !== "string") {
    diagnostics.push(
      invalidField(
        options.invalidCode,
        `Role field '${field}' must be a string when present.`,
        options.sourceName,
        `${options.pointer}/${field}`,
      ),
    );
    return null;
  }
  return element;
}

function parseImage(
  element: unknown,
  sourceName: string | null,
  pointer: string,
  code: string,
  diagnostics: Diagnostic[],
): string | null {
  if (element === undefined) return null;
  if (typeof element === "string") {
    if (element.trim().length > 0) return element;
    diagnostics.push(
      invalidField(
        code,
        "Role image reference must not be blank.",
        sourceName,
        pointer,
      ),
    );
    return null;
  }
  if (Array.isArray(element)) {
    const first = element[0];
    if (typeof first === "string" && first.trim().length > 0) return first;
    diagnostics.push(
      invalidField(
        code,
        "Role image array must start with a non-blank string.",
        sourceName,
        pointer,
      ),
    );
    return null;
  }
  diagnostics.push(
    invalidField(
      code,
      "Role image must be a string or an array of strings.",
      sourceName,
      pointer,
    ),
  );
  return null;
}

function parseTranslations(
  element: unknown,
  sourceName: string | null,
  pointer: string,
  code: string,
  diagnostics: Diagnostic[],
): Readonly<Record<string, RoleText>> {
  if (element === undefined) return {};
  if (
    element === null ||
    typeof element !== "object" ||
    Array.isArray(element)
  ) {
    diagnostics.push(
      invalidField(
        code,
        "Role translations must be a JSON object.",
        sourceName,
        pointer,
      ),
    );
    return {};
  }

  const translations: Record<string, RoleText> = {};
  for (const [rawTag, rawTranslation] of Object.entries(element)) {
    const translationPointer = `${pointer}/${escapeJsonPointer(rawTag)}`;
    if (
      rawTag.trim().length === 0 ||
      rawTranslation === null ||
      typeof rawTranslation !== "object" ||
      Array.isArray(rawTranslation)
    ) {
      diagnostics.push(
        invalidField(
          code,
          "Each translation must have a non-blank language tag and an object value.",
          sourceName,
          translationPointer,
        ),
      );
      continue;
    }
    const name = (rawTranslation as JsonObject).name;
    const ability = (rawTranslation as JsonObject).ability;
    if (
      typeof name !== "string" ||
      name.trim().length === 0 ||
      typeof ability !== "string" ||
      ability.trim().length === 0
    ) {
      diagnostics.push(
        invalidField(
          code,
          `Translation '${rawTag}' requires non-blank string fields 'name' and 'ability'.`,
          sourceName,
          translationPointer,
        ),
      );
      continue;
    }
    translations[rawTag] = { name, ability };
  }
  return translations;
}

function parseGroupOverride(
  element: unknown,
  sourceName: string | null,
  pointer: string,
  diagnostics: Diagnostic[],
): SaoGroupName | null {
  if (element === undefined) return null;
  if (typeof element !== "string" || element.trim().length === 0) {
    diagnostics.push(
      invalidField(
        DiagnosticCodes.SAO_GROUP_INVALID,
        "Role saoGroup must be a non-blank string.",
        sourceName,
        pointer,
      ),
    );
    return null;
  }
  const group = parseSaoGroup(element);
  if (group === null) {
    diagnostics.push(
      invalidField(
        DiagnosticCodes.SAO_GROUP_INVALID,
        `Unknown SAO group '${element.trim()}'.`,
        sourceName,
        pointer,
      ),
    );
  }
  return group;
}

function invalidField(
  code: string,
  message: string,
  sourceName: string | null,
  pointer: string,
): Diagnostic {
  return diagnostic(code, "error", message, location(sourceName, pointer));
}
