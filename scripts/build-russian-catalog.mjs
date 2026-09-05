import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";

const OFFICIAL_ROLES_URL = "https://release.botc.app/resources/data/roles.json";
const WIKI_API_URL = "https://botc.1nv.is/w/api.php";
const OFFICIAL_GAME_EN_URL =
  "https://raw.githubusercontent.com/ThePandemoniumInstitute/botc-translations/main/game/en.json";
const OFFICIAL_GAME_RU_URL =
  "https://raw.githubusercontent.com/ThePandemoniumInstitute/botc-translations/main/game/ru.json";
const DEFAULT_OUTPUT = fileURLToPath(
  new URL("../catalog/roles.ru.json", import.meta.url),
);

const WIKI_CATEGORIES = Object.freeze({
  townsfolk: "Townsfolk",
  outsider: "Outsider",
  minion: "Minion",
  demon: "Demon",
  traveller: "Traveler",
  fabled: "Fabled",
  loric: "Loric",
});

const RUSSIAN_TEAM_NAMES = Object.freeze({
  townsfolk: "Горожане",
  outsider: "Изгои",
  minion: "Приспешники",
  demon: "Демоны",
  traveller: "Странники",
  fabled: "Сказочные",
  loric: "Лорики",
});

const MANUAL_NIGHT_TRANSLATIONS = Object.freeze({
  empath: {
    first: "Покажите число пальцами.",
    other: "Покажите число пальцами.",
  },
  monk: {
    other: "Монах выбирает игрока. :reminder:",
  },
  yaggababble: {
    first: "Покажите Яггабабблу его секретную фразу.",
    other:
      "За каждый раз, когда Яггабаббл сегодня произнёс свою фразу, один игрок может умереть. :reminder:",
  },
  buddhist: {
    first: "Объявите, на каких игроков действует Буддист.",
  },
  tor: {
    other:
      "Если этой ночью умер игрок, покажите жетон *ВЫ -*, жетон его персонажа и подайте сигнал большим пальцем.",
  },
});

const MANUAL_REMINDER_TRANSLATIONS = Object.freeze({
  "?": "?",
  1: "1",
  2: "2",
  3: "3",
  X: "X",
  Hat: "Шляпа",
});

const options = readArguments(process.argv.slice(2));
const outputPath = resolve(options.output);
const officialSource = options.source ?? OFFICIAL_ROLES_URL;
const officialRoles =
  options.source === null
    ? await (await fetchChecked(OFFICIAL_ROLES_URL)).json()
    : JSON.parse(await readFile(resolve(options.source), "utf8"));
validateOfficialRoles(officialRoles);
const [officialGameEnglish, officialGameRussian] = await Promise.all([
  fetchChecked(OFFICIAL_GAME_EN_URL).then((response) => response.json()),
  fetchChecked(OFFICIAL_GAME_RU_URL).then((response) => response.json()),
]);
validateGameTranslations(officialGameEnglish, officialGameRussian);

const officialById = new Map(officialRoles.map((role) => [role.id, role]));
const categoryPages = (
  await Promise.all(
    Object.entries(WIKI_CATEGORIES).map(async ([team, category]) =>
      (await fetchCategoryMembers(category)).map((page) => ({ ...page, team })),
    ),
  )
).flat();

const pageDetails = await fetchPageDetails(categoryPages);
const pagesByRoleId = new Map();
for (const page of pageDetails) {
  const roleId = pageImageToRoleId(page.pageimage);
  const official = roleId === null ? undefined : officialById.get(roleId);
  if (official === undefined || official.team !== page.team) continue;
  const candidates = pagesByRoleId.get(roleId) ?? [];
  candidates.push(page);
  pagesByRoleId.set(roleId, candidates);
}

const selectedPages = new Map();
for (const role of officialRoles) {
  const candidates = pagesByRoleId.get(role.id) ?? [];
  selectedPages.set(role.id, selectRussianPage(role, candidates));
}

const wikiTranslations = new Map(
  await mapConcurrent(officialRoles, 8, async (role) => {
    const page = selectedPages.get(role.id);
    const parsed = await fetchWikiParse(page.pageid);
    return [
      role.id,
      {
        name: parsed.title.trim(),
        ability: extractFormattedAbility(parsed.text, parsed.title),
      },
    ];
  }),
);

const reminderKeyByEnglish = new Map(
  Object.entries(officialGameEnglish.reminders).map(([key, value]) => [
    value,
    key,
  ]),
);
const catalog = officialRoles.map((role) => {
  const { flavor: _flavor, ...canonical } = role;
  return {
    ...canonical,
    translations: {
      ru: buildRussianTranslation(
        role,
        wikiTranslations.get(role.id),
        officialGameRussian,
        reminderKeyByEnglish,
      ),
    },
  };
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

const counts = Object.fromEntries(
  Object.keys(WIKI_CATEGORIES).map((team) => [
    team,
    catalog.filter((role) => role.team === team).length,
  ]),
);
console.log(
  `Created ${outputPath}\n` +
    `Roles: ${catalog.length}; teams: ${JSON.stringify(counts)}\n` +
    `Official source: ${officialSource}\n` +
    `Russian ability source: ${WIKI_API_URL}\n` +
    `Russian operational text source: ${OFFICIAL_GAME_RU_URL}`,
);

function readArguments(args) {
  const options = { output: DEFAULT_OUTPUT, source: null };
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (value === undefined || value.trim() === "") {
      throw new Error(`Option '${name}' requires a value.`);
    }
    if (name === "--out") options.output = value;
    else if (name === "--source") options.source = value;
    else throw new Error(`Unknown option '${name}'.`);
  }
  return options;
}

async function fetchCategoryMembers(category) {
  const members = [];
  let continuation = null;
  do {
    const data = await fetchWikiJson({
      action: "query",
      list: "categorymembers",
      cmtitle: `Category:${category}`,
      cmnamespace: "0",
      cmlimit: "max",
      ...(continuation === null ? {} : { cmcontinue: continuation }),
    });
    members.push(...(data.query?.categorymembers ?? []));
    continuation = data.continue?.cmcontinue ?? null;
  } while (continuation !== null);
  return members;
}

async function fetchPageDetails(categoryPages) {
  const teamByPageId = new Map(
    categoryPages.map((page) => [Number(page.pageid), page.team]),
  );
  const uniqueIds = [...teamByPageId.keys()];
  const batches = chunk(uniqueIds, 50);
  const responses = await mapConcurrent(batches, 4, (pageIds) =>
    fetchWikiJson({
      action: "query",
      prop: "pageimages",
      piprop: "name",
      pageids: pageIds.join("|"),
    }),
  );
  return responses.flatMap((data) =>
    (data.query?.pages ?? []).map((page) => ({
      ...page,
      team: teamByPageId.get(Number(page.pageid)),
    })),
  );
}

async function fetchWikiParse(pageId) {
  const data = await fetchWikiJson({
    action: "parse",
    pageid: String(pageId),
    prop: "text",
  });
  if (data.parse?.title === undefined || data.parse?.text === undefined) {
    throw new Error(`Wiki did not return parsed text for page id ${pageId}.`);
  }
  return data.parse;
}

async function fetchWikiJson(parameters) {
  const url = new URL(WIKI_API_URL);
  for (const [name, value] of Object.entries({
    ...parameters,
    format: "json",
    formatversion: "2",
  })) {
    url.searchParams.set(name, value);
  }
  const response = await fetchChecked(url);
  const data = await response.json();
  if (data.error !== undefined) {
    throw new Error(`Wiki API error: ${JSON.stringify(data.error)}`);
  }
  return data;
}

async function fetchChecked(input, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(input, {
        headers: { "user-agent": "botc-pdf-generator/0.1" },
      });
      if (response.ok) return response;
      lastError = new Error(
        `HTTP ${response.status} ${response.statusText} for ${response.url}`,
      );
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) {
      await new Promise((resolveDelay) =>
        setTimeout(resolveDelay, attempt * 400),
      );
    }
  }
  throw lastError;
}

function pageImageToRoleId(pageimage) {
  if (typeof pageimage !== "string" || pageimage.trim() === "") return null;
  const filename = pageimage.split(/[\\/]/).at(-1);
  return filename.replace(/\.[^.]+$/, "").toLowerCase();
}

function selectRussianPage(role, candidates) {
  if (candidates.length === 0) {
    throw new Error(
      `No Russian wiki page found for ${role.id} (${role.name}, ${role.team}).`,
    );
  }
  const russian = candidates.filter((page) =>
    /\p{Script=Cyrillic}/u.test(page.title),
  );
  const preferred = russian.length > 0 ? russian : candidates;
  if (preferred.length !== 1) {
    throw new Error(
      `Ambiguous Russian wiki pages for ${role.id}: ${preferred
        .map((page) => page.title)
        .join(", ")}`,
    );
  }
  return preferred[0];
}

function extractFormattedAbility(html, title) {
  const $ = load(html, null, false);
  const heading = $("h2")
    .filter(
      (_index, element) =>
        $(element).text().trim() ===
        "\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435",
    )
    .first();
  if (heading.length === 0) {
    throw new Error(`Wiki page '${title}' has no Russian ability heading.`);
  }

  const headingBlock = heading.closest(".mw-heading");
  const paragraph = (headingBlock.length > 0 ? headingBlock : heading)
    .nextAll("p")
    .first();
  if (paragraph.length === 0) {
    throw new Error(`Wiki page '${title}' has no ability paragraph.`);
  }

  const markup = paragraph
    .contents()
    .toArray()
    .map((node) => renderRichNode($, node))
    .join("")
    .replace(/\u2733/g, "*")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
  if (markup === "") {
    throw new Error(`Wiki page '${title}' has an empty ability paragraph.`);
  }
  return markup;
}

function renderRichNode($, node) {
  if (node.type === "text") return node.data ?? "";
  if (node.type !== "tag") return "";
  if (node.name === "br") return " ";

  const content = $(node)
    .contents()
    .toArray()
    .map((child) => renderRichNode($, child))
    .join("");
  if (node.name === "b" || node.name === "strong") {
    return `[b]${content}[/b]`;
  }
  if (node.name === "span") {
    const color = ($(node).attr("style") ?? "").match(
      /(?:^|;)\s*color\s*:\s*(#[0-9a-f]{6})(?:\s*;|$)/i,
    )?.[1];
    if (color !== undefined) {
      return `[color=${color.toUpperCase()}]${content}[/color]`;
    }
  }
  return content;
}

function buildRussianTranslation(
  role,
  wikiTranslation,
  officialGameRussian,
  reminderKeyByEnglish,
) {
  if (wikiTranslation === undefined) {
    throw new Error(`Missing Russian wiki translation for ${role.id}.`);
  }
  const translation = {
    ...wikiTranslation,
    team: RUSSIAN_TEAM_NAMES[role.team],
    reminders: role.reminders.map((label) =>
      translateReminder(label, officialGameRussian, reminderKeyByEnglish),
    ),
  };

  if (Object.hasOwn(role, "firstNightReminder")) {
    translation.firstNightReminder = translateNightReminder(
      role,
      "first",
      officialGameRussian,
    );
  }
  if (Object.hasOwn(role, "otherNightReminder")) {
    translation.otherNightReminder = translateNightReminder(
      role,
      "other",
      officialGameRussian,
    );
  }
  if (Object.hasOwn(role, "remindersGlobal")) {
    translation.remindersGlobal = role.remindersGlobal.map((label) =>
      translateReminder(label, officialGameRussian, reminderKeyByEnglish),
    );
  }
  return translation;
}

function translateNightReminder(role, field, officialGameRussian) {
  const sourceField =
    field === "first" ? "firstNightReminder" : "otherNightReminder";
  if (role[sourceField] === "") return "";
  const value =
    officialGameRussian.roles[role.id]?.[field] ??
    MANUAL_NIGHT_TRANSLATIONS[role.id]?.[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `Missing Russian ${sourceField} translation for ${role.id}.`,
    );
  }
  return formatInlineBold(value);
}

function translateReminder(label, officialGameRussian, reminderKeyByEnglish) {
  const manual = MANUAL_REMINDER_TRANSLATIONS[label];
  if (manual !== undefined) return manual;
  const key = reminderKeyByEnglish.get(label);
  const value =
    key === undefined ? undefined : officialGameRussian.reminders[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing Russian reminder translation for '${label}'.`);
  }
  return value;
}

function formatInlineBold(value) {
  return value.replace(/\*([^*]+)\*/g, "[b]$1[/b]");
}

function validateGameTranslations(english, russian) {
  for (const [name, value] of [
    ["English", english],
    ["Russian", russian],
  ]) {
    if (
      value === null ||
      typeof value !== "object" ||
      value.roles === null ||
      typeof value.roles !== "object" ||
      value.reminders === null ||
      typeof value.reminders !== "object"
    ) {
      throw new Error(`${name} game translation has an invalid shape.`);
    }
  }
}

function validateOfficialRoles(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Official roles source must be a non-empty JSON array.");
  }
  const ids = new Set();
  for (const [index, role] of value.entries()) {
    if (
      role === null ||
      typeof role !== "object" ||
      typeof role.id !== "string" ||
      typeof role.name !== "string" ||
      typeof role.team !== "string" ||
      typeof role.ability !== "string" ||
      !(role.team in WIKI_CATEGORIES)
    ) {
      throw new Error(`Invalid official role at index ${index}.`);
    }
    if (ids.has(role.id))
      throw new Error(`Duplicate official role id ${role.id}.`);
    ids.add(role.id);
  }
}

function chunk(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function mapConcurrent(values, limit, mapper) {
  const output = new Array(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      output[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => worker()),
  );
  return output;
}
