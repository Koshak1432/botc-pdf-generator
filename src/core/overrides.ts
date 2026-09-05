import { Ajv, type ErrorObject } from "ajv";
import {
  diagnostic,
  DiagnosticCodes,
  location,
  type Diagnostic,
} from "./diagnostics.js";
import { jsonErrorMessage, normalizeRoleId } from "./json.js";
import type { CoreResult, PresentationOverride } from "./model.js";

type RawPresentationOverride = {
  nameMarkup?: string;
  abilityMarkup?: string;
  image?: string;
};

type RawPresentationOverrides = Record<string, RawPresentationOverride>;

const schema = {
  type: "object",
  propertyNames: {
    pattern: "^\\s*[A-Za-z0-9][A-Za-z0-9_-]{0,49}\\s*$",
  },
  additionalProperties: {
    type: "object",
    additionalProperties: false,
    properties: {
      nameMarkup: { type: "string" },
      abilityMarkup: { type: "string" },
      image: { type: "string", minLength: 1 },
    },
  },
} as const;

const validate = new Ajv({ allErrors: true }).compile<RawPresentationOverrides>(
  schema,
);

export function parsePresentationOverrides(
  input: string,
  sourceName: string | null = null,
): CoreResult<Readonly<Record<string, PresentationOverride>>> {
  let root: unknown;
  try {
    root = JSON.parse(input) as unknown;
  } catch (error) {
    return {
      value: null,
      diagnostics: [
        diagnostic(
          DiagnosticCodes.OVERRIDES_JSON_INVALID,
          "error",
          `Invalid overrides JSON: ${jsonErrorMessage(error)}`,
          location(sourceName),
        ),
      ],
    };
  }

  if (!validate(root)) {
    const diagnostics = (validate.errors ?? []).map((error) =>
      ajvDiagnostic(error, sourceName),
    );
    return { value: null, diagnostics };
  }

  const result: Record<string, PresentationOverride> = {};
  for (const [rawId, override] of Object.entries(root)) {
    const id = normalizeRoleId(rawId);
    if (id === null) continue;
    result[id] = {
      nameMarkup: override.nameMarkup ?? null,
      abilityMarkup: override.abilityMarkup ?? null,
      image: override.image ?? null,
    };
  }
  return { value: result, diagnostics: [] };
}

function ajvDiagnostic(
  error: ErrorObject,
  sourceName: string | null,
): Diagnostic {
  const details = describeAjvError(error);
  return diagnostic(
    DiagnosticCodes.OVERRIDES_JSON_INVALID,
    "error",
    `Invalid presentation overrides: ${details}.`,
    location(sourceName, error.instancePath),
  );
}

function describeAjvError(error: ErrorObject): string {
  if (error.keyword === "additionalProperties") {
    const property = (error.params as { additionalProperty?: string })
      .additionalProperty;
    return `unknown field '${property ?? "?"}'`;
  }
  if (error.keyword === "propertyNames") {
    const property = (error.params as { propertyName?: string }).propertyName;
    return `invalid role id '${property ?? "?"}'`;
  }
  return error.message ?? error.keyword;
}
