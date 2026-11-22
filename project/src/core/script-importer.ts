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
  emptyMetadata,
  type CoreResult,
  type ScriptDocument,
  type ScriptMetadata,
  type ScriptRoleEntry,
} from "./model.js";
import { decodeRoleDefinition } from "./role-decoder.js";

export function importScriptJson(
  input: string,
  sourceName: string | null = null,
): CoreResult<ScriptDocument> {
  let root: unknown;
  try {
    root = JSON.parse(input) as unknown;
  } catch (error) {
    return {
      value: null,
      diagnostics: [
        diagnostic(
          DiagnosticCodes.SCRIPT_JSON_INVALID,
          "error",
          `Invalid script JSON: ${jsonErrorMessage(error)}`,
          location(sourceName),
        ),
      ],
    };
  }
  if (!Array.isArray(root)) {
    return {
      value: null,
      diagnostics: [
        diagnostic(
          DiagnosticCodes.SCRIPT_ROOT_NOT_ARRAY,
          "error",
          "BOTC script root must be a JSON array.",
          location(sourceName, ""),
        ),
      ],
    };
  }

  const diagnostics: Diagnostic[] = [];
  const roles: ScriptRoleEntry[] = [];
  let metadata = emptyMetadata();
  let metadataSeen = false;

  root.forEach((element, index) => {
    const pointer = `/${index}`;
    if (typeof element === "string") {
      const id = parseRoleId(element, sourceName, pointer, diagnostics);
      if (id !== null) {
        roles.push({
          kind: "reference",
          id,
          sourceLocation: location(sourceName, pointer),
        });
      }
      return;
    }

    if (!isJsonObject(element)) {
      diagnostics.push(
        diagnostic(
          DiagnosticCodes.SCRIPT_ELEMENT_UNSUPPORTED,
          "error",
          "Script element must be a role id string or an object.",
          location(sourceName, pointer),
        ),
      );
      return;
    }

    const rawId = typeof element.id === "string" ? element.id : null;
    if (rawId === "_meta") {
      if (metadataSeen) {
        diagnostics.push(
          diagnostic(
            DiagnosticCodes.SCRIPT_META_DUPLICATE,
            "error",
            "Script contains more than one _meta object; the first one is used.",
            location(sourceName, pointer),
          ),
        );
      } else {
        metadataSeen = true;
        const parsed = parseMetadata(element, sourceName, pointer);
        metadata = parsed.value ?? emptyMetadata();
        diagnostics.push(...parsed.diagnostics);
      }
      return;
    }

    if (rawId === null) {
      diagnostics.push(
        diagnostic(
          DiagnosticCodes.ROLE_INLINE_INVALID,
          "error",
          "Script role object requires a string field 'id'.",
          location(sourceName, `${pointer}/id`),
        ),
      );
      return;
    }

    if (Object.keys(element).length === 1) {
      const id = parseRoleId(rawId, sourceName, `${pointer}/id`, diagnostics);
      if (id !== null) {
        roles.push({
          kind: "reference",
          id,
          sourceLocation: location(sourceName, pointer),
        });
      }
      return;
    }

    const decoded = decodeRoleDefinition(element, {
      sourceName,
      pointer,
      invalidCode: DiagnosticCodes.ROLE_INLINE_INVALID,
      officialIndex: null,
    });
    diagnostics.push(...decoded.diagnostics);
    if (decoded.value !== null) {
      roles.push({
        kind: "inline",
        id: decoded.value.id,
        role: decoded.value,
        sourceLocation: location(sourceName, pointer),
      });
    }
  });

  return {
    value: { metadata, roles },
    diagnostics,
  };
}

function parseMetadata(
  value: JsonObject,
  sourceName: string | null,
  pointer: string,
): CoreResult<ScriptMetadata> {
  const diagnostics: Diagnostic[] = [];
  const name = optionalMetadataString(
    value,
    "name",
    sourceName,
    pointer,
    diagnostics,
  );
  if (name === null || name.trim().length === 0) {
    diagnostics.push(
      diagnostic(
        DiagnosticCodes.SCRIPT_META_INVALID,
        "error",
        "Script _meta requires a non-blank string field 'name'.",
        location(sourceName, `${pointer}/name`),
      ),
    );
  }
  const author = optionalMetadataString(
    value,
    "author",
    sourceName,
    pointer,
    diagnostics,
  );
  const logo = optionalImage(value, "logo", sourceName, pointer, diagnostics);
  const background = optionalImage(
    value,
    "background",
    sourceName,
    pointer,
    diagnostics,
  );
  const bootlegger = parseBootleggerRules(value, sourceName, pointer, diagnostics);
  return {
    value: {
      name: name !== null && name.trim().length > 0 ? name : null,
      author,
      logo,
      background,
      bootlegger,
    },
    diagnostics,
  };
}

function parseBootleggerRules(
  value: JsonObject,
  sourceName: string | null,
  pointer: string,
  diagnostics: Diagnostic[],
): readonly string[] {
  const element = value.bootlegger;
  if (element === undefined) return [];
  if (!Array.isArray(element)) {
    diagnostics.push(
      diagnostic(
        DiagnosticCodes.SCRIPT_META_INVALID,
        "error",
        "Поле _meta.bootlegger должно быть массивом непустых строк.",
        location(sourceName, `${pointer}/bootlegger`),
      ),
    );
    return [];
  }
  const rules: string[] = [];
  element.forEach((rule, index) => {
    if (typeof rule === "string" && rule.trim().length > 0) {
      rules.push(rule);
    } else {
      diagnostics.push(
        diagnostic(
          DiagnosticCodes.SCRIPT_META_INVALID,
          "error",
          "Правило Бутлегера должно быть непустой строкой.",
          location(sourceName, `${pointer}/bootlegger/${index}`),
        ),
      );
    }
  });
  return rules;
}

function optionalMetadataString(
  value: JsonObject,
  field: string,
  sourceName: string | null,
  pointer: string,
  diagnostics: Diagnostic[],
): string | null {
  const element = value[field];
  if (element === undefined) return null;
  if (typeof element !== "string") {
    diagnostics.push(
      diagnostic(
        DiagnosticCodes.SCRIPT_META_INVALID,
        "error",
        `Script _meta field '${field}' must be a string.`,
        location(sourceName, `${pointer}/${field}`),
      ),
    );
    return null;
  }
  return element;
}

function optionalImage(
  value: JsonObject,
  field: string,
  sourceName: string | null,
  pointer: string,
  diagnostics: Diagnostic[],
): string | null {
  const raw = optionalMetadataString(
    value,
    field,
    sourceName,
    pointer,
    diagnostics,
  );
  if (raw === null) return null;
  if (raw.trim().length > 0) return raw;
  diagnostics.push(
    diagnostic(
      DiagnosticCodes.SCRIPT_META_INVALID,
      "error",
      `Script _meta field '${field}' must not be blank.`,
      location(sourceName, `${pointer}/${field}`),
    ),
  );
  return null;
}

function parseRoleId(
  raw: string,
  sourceName: string | null,
  pointer: string,
  diagnostics: Diagnostic[],
): string | null {
  const id = normalizeRoleId(raw);
  if (id !== null) return id;
  diagnostics.push(
    diagnostic(
      DiagnosticCodes.ROLE_ID_INVALID,
      "error",
      `Role id '${raw}' must contain only lowercase letters, digits, '-' or '_'.`,
      location(sourceName, pointer),
    ),
  );
  return null;
}
