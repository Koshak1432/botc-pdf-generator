export type Severity = "info" | "warning" | "error";

export interface SourceLocation {
  readonly source: string | null;
  readonly jsonPointer: string | null;
}

export interface Diagnostic {
  readonly code: string;
  readonly severity: Severity;
  readonly message: string;
  readonly location: SourceLocation | null;
}

export const DiagnosticCodes = {
  SCRIPT_JSON_INVALID: "SCRIPT_JSON_INVALID",
  SCRIPT_ROOT_NOT_ARRAY: "SCRIPT_ROOT_NOT_ARRAY",
  SCRIPT_ELEMENT_UNSUPPORTED: "SCRIPT_ELEMENT_UNSUPPORTED",
  SCRIPT_META_DUPLICATE: "SCRIPT_META_DUPLICATE",
  SCRIPT_META_INVALID: "SCRIPT_META_INVALID",
  ROLE_ID_INVALID: "ROLE_ID_INVALID",
  ROLE_INLINE_INVALID: "ROLE_INLINE_INVALID",
  ROLE_UNKNOWN: "ROLE_UNKNOWN",
  ROLE_DUPLICATE: "ROLE_DUPLICATE",
  CATALOG_JSON_INVALID: "CATALOG_JSON_INVALID",
  CATALOG_ROOT_NOT_ARRAY: "CATALOG_ROOT_NOT_ARRAY",
  CATALOG_ROLE_INVALID: "CATALOG_ROLE_INVALID",
  CATALOG_DUPLICATE_ID: "CATALOG_DUPLICATE_ID",
  LOCALIZATION_FALLBACK: "LOCALIZATION_FALLBACK",
  MARKUP_INVALID_COLOR: "MARKUP_INVALID_COLOR",
  MARKUP_MISMATCHED_TAG: "MARKUP_MISMATCHED_TAG",
  MARKUP_UNCLOSED_TAG: "MARKUP_UNCLOSED_TAG",
  SAO_FALLBACK_GROUP: "SAO_FALLBACK_GROUP",
  SAO_GROUP_INVALID: "SAO_GROUP_INVALID",
  PRESENTATION_TEXT_BLANK: "PRESENTATION_TEXT_BLANK",
  PRESENTATION_OVERRIDE_UNUSED: "PRESENTATION_OVERRIDE_UNUSED",
  OVERRIDES_JSON_INVALID: "OVERRIDES_JSON_INVALID",
  NIGHT_ORDER_JSON_INVALID: "NIGHT_ORDER_JSON_INVALID",
  NIGHT_ORDER_ROOT_INVALID: "NIGHT_ORDER_ROOT_INVALID",
  NIGHT_ORDER_FIELD_INVALID: "NIGHT_ORDER_FIELD_INVALID",
  NIGHT_ORDER_ENTRY_INVALID: "NIGHT_ORDER_ENTRY_INVALID",
  JINXES_JSON_INVALID: "JINXES_JSON_INVALID",
  JINXES_ROOT_NOT_ARRAY: "JINXES_ROOT_NOT_ARRAY",
  JINX_GROUP_INVALID: "JINX_GROUP_INVALID",
  JINX_ENTRY_INVALID: "JINX_ENTRY_INVALID",
} as const;

export function location(
  source: string | null = null,
  jsonPointer: string | null = null,
): SourceLocation {
  return { source, jsonPointer };
}

export function diagnostic(
  code: string,
  severity: Severity,
  message: string,
  sourceLocation: SourceLocation | null = null,
): Diagnostic {
  return {
    code,
    severity,
    message,
    location: sourceLocation,
  };
}

export function formatDiagnostic(item: Diagnostic): string {
  const source = item.location?.source ?? "input";
  const pointer = item.location?.jsonPointer ?? "";
  return `${item.severity.toUpperCase()} ${item.code} ${source}${pointer}: ${item.message}`;
}
