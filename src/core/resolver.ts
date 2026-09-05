import type { RoleCatalog } from "./catalog.js";
import {
  diagnostic,
  DiagnosticCodes,
  location,
  type Diagnostic,
} from "./diagnostics.js";
import { normalizeRoleId } from "./json.js";
import type {
  CoreResult,
  PresentationOverride,
  ResolvedRole,
  ResolvedScript,
  RoleDefinition,
  RoleText,
  ScriptDocument,
} from "./model.js";

export interface ResolveScriptOptions {
  readonly locale?: string;
  readonly overrides?: Readonly<Record<string, PresentationOverride>>;
}

export function resolveScript(
  script: ScriptDocument,
  catalog: RoleCatalog,
  options: ResolveScriptOptions = {},
): CoreResult<ResolvedScript> {
  const diagnostics: Diagnostic[] = [];
  const resolved: ResolvedRole[] = [];
  const seen = new Set<string>();
  const normalizedOverrides = normalizeOverrides(options.overrides ?? {});
  const localeTag = options.locale ?? "en";

  script.roles.forEach((entry, index) => {
    const id = normalizeRoleId(entry.id) ?? entry.id;
    const sourceLocation =
      entry.sourceLocation ?? location(null, `/roles/${index}`);
    if (seen.has(id)) {
      diagnostics.push(
        diagnostic(
          DiagnosticCodes.ROLE_DUPLICATE,
          "error",
          `Script contains duplicate role id '${id}'; the first one is used.`,
          sourceLocation,
        ),
      );
      return;
    }
    seen.add(id);

    const definition =
      entry.kind === "reference" ? catalog.get(id) : entry.role;
    if (definition === null) {
      diagnostics.push(
        diagnostic(
          DiagnosticCodes.ROLE_UNKNOWN,
          "error",
          `Role '${id}' was not found in the catalog.`,
          sourceLocation,
        ),
      );
      return;
    }
    const displayText = selectDisplayText(
      definition,
      localeTag,
      diagnostics,
      sourceLocation,
    );
    resolved.push({
      definition,
      displayText,
      presentationOverride: normalizedOverrides[id] ?? null,
    });
  });

  Object.keys(normalizedOverrides)
    .filter((id) => !seen.has(id))
    .sort()
    .forEach((id) => {
      diagnostics.push(
        diagnostic(
          DiagnosticCodes.PRESENTATION_OVERRIDE_UNUSED,
          "warning",
          `Presentation override targets role '${id}', which is not in the script.`,
        ),
      );
    });

  return {
    value: { metadata: script.metadata, roles: resolved },
    diagnostics,
  };
}

function normalizeOverrides(
  overrides: Readonly<Record<string, PresentationOverride>>,
): Readonly<Record<string, PresentationOverride>> {
  const normalized: Record<string, PresentationOverride> = {};
  for (const [rawId, override] of Object.entries(overrides)) {
    const id = normalizeRoleId(rawId);
    if (id !== null) normalized[id] = override;
  }
  return normalized;
}

function selectDisplayText(
  definition: RoleDefinition,
  localeTag: string,
  diagnostics: Diagnostic[],
  sourceLocation: ReturnType<typeof location>,
): RoleText {
  const requested = localeTag.trim().replaceAll("_", "-");
  const candidates: string[] = [];
  let candidate = requested;
  while (candidate.length > 0) {
    candidates.push(candidate);
    const separator = candidate.lastIndexOf("-");
    candidate = separator < 0 ? "" : candidate.slice(0, separator);
  }

  for (const language of candidates) {
    const match = Object.entries(definition.translations).find(
      ([tag]) =>
        tag
          .replaceAll("_", "-")
          .localeCompare(language, undefined, { sensitivity: "accent" }) === 0,
    );
    if (match !== undefined) return match[1];
  }

  if (candidates.at(-1)?.toLowerCase() !== "en") {
    diagnostics.push(
      diagnostic(
        DiagnosticCodes.LOCALIZATION_FALLBACK,
        "warning",
        `No '${localeTag}' translation for role '${definition.id}'; canonical text is used.`,
        sourceLocation,
      ),
    );
  }
  return definition.canonicalText;
}
