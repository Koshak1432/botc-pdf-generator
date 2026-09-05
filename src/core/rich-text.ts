import {
  diagnostic,
  DiagnosticCodes,
  location,
  type Diagnostic,
} from "./diagnostics.js";
import type { CoreResult, RichText, TextRun, TextStyle } from "./model.js";

type TagKind = "bold" | "color";

interface Scope {
  readonly kind: TagKind;
  readonly color: string | null;
  readonly openingIndex: number;
  readonly rawOpening: string;
  readonly literal: boolean;
}

const CLOSING_TAG: Readonly<Record<TagKind, string>> = {
  bold: "[/b]",
  color: "[/color]",
};

export function parseRichText(
  markup: string,
  source: string | null = null,
): CoreResult<RichText> {
  const runs: TextRun[] = [];
  const scopes: Scope[] = [];
  const diagnostics: Diagnostic[] = [];
  let cursor = 0;

  const currentStyle = (): TextStyle => {
    let bold = false;
    let color: string | null = null;
    for (const scope of scopes) {
      if (scope.kind === "bold") bold = true;
      if (scope.kind === "color" && !scope.literal) color = scope.color;
    }
    return { bold, color };
  };

  const append = (text: string): void => {
    if (text.length === 0) return;
    const style = currentStyle();
    const previous = runs.at(-1);
    if (
      previous !== undefined &&
      previous.style.bold === style.bold &&
      previous.style.color === style.color
    ) {
      runs[runs.length - 1] = { text: previous.text + text, style };
    } else {
      runs.push({ text, style });
    }
  };

  const report = (code: string, message: string): void => {
    diagnostics.push(
      diagnostic(
        code,
        "error",
        message,
        source === null ? null : location(source),
      ),
    );
  };

  const open = (
    kind: TagKind,
    index: number,
    raw: string,
    color: string | null = null,
    literal = false,
  ): void => {
    scopes.push({
      kind,
      color,
      openingIndex: index,
      rawOpening: raw,
      literal,
    });
  };

  const close = (kind: TagKind, index: number, raw: string): void => {
    const scope = scopes.at(-1);
    if (scope?.kind === kind) {
      scopes.pop();
      if (scope.literal) append(raw);
      return;
    }
    const expectation =
      scope === undefined ? "" : `; expected ${CLOSING_TAG[scope.kind]}`;
    report(
      DiagnosticCodes.MARKUP_MISMATCHED_TAG,
      `Unexpected closing tag ${raw} at character ${index}${expectation}.`,
    );
    append(raw);

    let matchingIndex = -1;
    for (let scopeIndex = scopes.length - 1; scopeIndex >= 0; scopeIndex -= 1) {
      if (scopes[scopeIndex]?.kind === kind) {
        matchingIndex = scopeIndex;
        break;
      }
    }
    if (matchingIndex >= 0) scopes.splice(matchingIndex);
  };

  const tagPattern = /\[(?:b|\/b|\/color|color(?:=[^\]]*)?)\]/g;
  while (cursor < markup.length) {
    tagPattern.lastIndex = cursor;
    const match = tagPattern.exec(markup);
    if (match === null) {
      append(markup.slice(cursor));
      break;
    }
    const openingBracket = match.index;
    append(markup.slice(cursor, openingBracket));
    const raw = match[0];
    if (raw === "[b]") {
      open("bold", openingBracket, raw);
    } else if (raw === "[/b]") {
      close("bold", openingBracket, raw);
    } else if (raw === "[/color]") {
      close("color", openingBracket, raw);
    } else if (isColorOpeningCandidate(raw)) {
      const match = /^\[color=#([0-9A-Fa-f]{6})]$/.exec(raw);
      if (match?.[1] === undefined) {
        report(
          DiagnosticCodes.MARKUP_INVALID_COLOR,
          `Invalid color tag ${raw} at character ${openingBracket}; expected [color=#RRGGBB].`,
        );
        append(raw);
        open("color", openingBracket, raw, null, true);
      } else {
        open("color", openingBracket, raw, `#${match[1].toUpperCase()}`);
      }
    } else {
      append(raw);
    }
    cursor = openingBracket + raw.length;
  }

  for (const scope of scopes) {
    report(
      DiagnosticCodes.MARKUP_UNCLOSED_TAG,
      `Unclosed tag ${scope.rawOpening} opened at character ${scope.openingIndex}.`,
    );
  }

  return {
    value: {
      runs,
      plainText: runs.map((run) => run.text).join(""),
    },
    diagnostics,
  };
}

function isColorOpeningCandidate(raw: string): boolean {
  if (raw.length < 2 || !raw.startsWith("[") || !raw.endsWith("]"))
    return false;
  const body = raw.slice(1, -1);
  return body === "color" || body.startsWith("color=");
}
