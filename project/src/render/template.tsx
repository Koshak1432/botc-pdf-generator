import { readFile } from "node:fs/promises";
import type { CSSProperties, ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  ActiveJinx,
  NightMarkerId,
  NightOrderItem,
  NightSheet,
  PlayerMemo,
  RichText,
  RoleCard,
  RoleTeam,
} from "../core/model.js";
import { paginateMemo, type MemoPage, type PageSection } from "./pagination.js";

export interface RenderHtmlOptions {
  readonly locale?: string;
  readonly cardsPerPage?: number;
  readonly subtitle?: string | null;
}

export interface RenderStorytellerHtmlOptions {
  readonly locale?: string;
}

interface Copy {
  readonly teamLabels: Readonly<Record<RoleTeam, string>>;
  readonly continued: string;
  readonly nightLegend: string;
  readonly firstNight: string;
  readonly otherNight: string;
  readonly storytellerMemo: string;
  readonly jinxes: string;
  readonly markerLabels: Readonly<Record<NightMarkerId, string>>;
  readonly markerReminders: Readonly<Record<NightMarkerId, RichText>>;
  readonly markerImages?: Readonly<Partial<Record<NightMarkerId, string>>>;
  readonly playerCountsImage?: string;
}

const ENGLISH_COPY: Copy = {
  teamLabels: {
    townsfolk: "Townsfolk",
    outsider: "Outsiders",
    minion: "Minions",
    demon: "Demons",
    traveller: "Travellers",
    fabled: "Fabled",
    loric: "Loric",
  },
  continued: "continued",
  nightLegend: "* Not on the first night",
  firstNight: "First night",
  otherNight: "Other nights",
  storytellerMemo: "Storyteller reference",
  jinxes: "Jinxes",
  markerLabels: {
    dusk: "Dusk",
    minioninfo: "Minion info",
    demoninfo: "Demon info",
    dawn: "Dawn",
  },
  markerReminders: {
    dusk: copyRichText([
      "Make sure every player's eyes are closed. Resolve the night abilities of Travellers, Fabled, and Loric characters.",
    ]),
    minioninfo: copyRichText([
      "With 7 or more players, wake all Minions. Show ",
      { bold: "This is the Demon" },
      " and point to the Demon.",
    ]),
    demoninfo: copyRichText([
      "With 7 or more players, wake the Demon. Show ",
      { bold: "These are your Minions" },
      " and point to every Minion. Show ",
      { bold: "These characters are not in play" },
      " and 3 good character tokens that are not in play.",
    ]),
    dawn: copyRichText([
      "Wait a few seconds. Let everyone open their eyes. Announce which players died or came back to life during the night.",
    ]),
  },
};

const RUSSIAN_COPY: Copy = {
  teamLabels: {
    townsfolk: "Горожане",
    outsider: "Изгои",
    minion: "Приспешники",
    demon: "Демоны",
    traveller: "Странники",
    fabled: "Сказочные",
    loric: "Лорики",
  },
  continued: "продолжение",
  nightLegend: "* Не в первую ночь",
  firstNight: "Первая ночь",
  otherNight: "Последующие ночи",
  storytellerMemo: "Памятка рассказчика",
  jinxes: "Сглазы",
  markerLabels: {
    dusk: "Закат",
    minioninfo: "Приспешники",
    demoninfo: "Демон",
    dawn: "Рассвет",
  },
  markerReminders: {
    dusk: copyRichText([
      "Убедитесь, что у всех игроков закрыты глаза. Задействуйте ночные способности Странников, Сказочных и Лориков.",
    ]),
    minioninfo: copyRichText([
      "Если в игре 7 или больше игроков, разбудите всех Приспешников. Покажите жетон «",
      { bold: "Это Демон" },
      "» и укажите на Демона.",
    ]),
    demoninfo: copyRichText([
      "Если в игре 7 или больше игроков, разбудите Демона. Покажите жетон «",
      { bold: "Это Приспешники" },
      "» и укажите на каждого Приспешника. Покажите жетон «",
      { bold: "Этих ролей нет в игре" },
      "» и 3 жетона добрых ролей, которых нет в игре.",
    ]),
    dawn: copyRichText([
      "Подождите несколько секунд. Разрешите всем открыть глаза. Сообщите, кто из игроков умер или ожил ночью.",
    ]),
  },
};

function copyRichText(
  parts: readonly (string | { readonly bold: string })[],
): RichText {
  const runs = parts.map((part) => ({
    text: typeof part === "string" ? part : part.bold,
    style: {
      bold: typeof part !== "string",
      color: null,
    },
  }));
  return {
    runs,
    plainText: runs.map((run) => run.text).join(""),
  };
}

export async function renderMemoHtml(
  memo: PlayerMemo,
  options: RenderHtmlOptions = {},
): Promise<string> {
  const [
    css,
    memoFont,
    titleFont,
    minionMarker,
    demonMarker,
    playerCounts,
    nightTableScript,
    rolePageScript,
  ] = await Promise.all([
    readFile(new URL("./print.css", import.meta.url), "utf8"),
    readFile(new URL("./fonts/Dumbledor3Thin.ttf", import.meta.url)),
    readFile(new URL("./fonts/ACharmingFontExpanded.ttf", import.meta.url)),
    readFile(new URL("../../assets/night/minion.webp", import.meta.url)),
    readFile(new URL("../../assets/night/demon.webp", import.meta.url)),
    readFile(new URL("../../assets/night/player-counts.png", import.meta.url)),
    readFile(new URL("./night-table-layout.js", import.meta.url), "utf8"),
    readFile(new URL("./role-page-layout.js", import.meta.url), "utf8"),
  ]);
  const memoFontCss = `@font-face {
    font-family: "Memo Dumbledor";
    src: url("data:font/ttf;base64,${memoFont.toString("base64")}") format("truetype");
    font-style: normal;
    font-weight: 400;
    font-display: block;
  }`;
  const titleFontCss = `@font-face {
    font-family: "Memo Charming Test";
    src: url("data:font/ttf;base64,${titleFont.toString("base64")}") format("truetype");
    font-style: normal;
    font-weight: 400;
    font-display: block;
  }`;
  const locale = options.locale ?? "ru";
  const baseCopy = locale.toLowerCase().startsWith("ru")
    ? RUSSIAN_COPY
    : ENGLISH_COPY;
  const copy: Copy = {
    ...baseCopy,
    markerImages: {
      minioninfo: `data:image/webp;base64,${minionMarker.toString("base64")}`,
      demoninfo: `data:image/webp;base64,${demonMarker.toString("base64")}`,
    },
    playerCountsImage: `data:image/png;base64,${playerCounts.toString("base64")}`,
  };
  const pages = paginateMemo(memo, options.cardsPerPage ?? 25);
  const markup = renderToStaticMarkup(
    <MemoDocument
      memo={memo}
      pages={pages}
      locale={locale}
      copy={copy}
      subtitle={options.subtitle ?? null}
      nightTableScript={nightTableScript}
      rolePageScript={rolePageScript}
      css={`
        ${memoFontCss}\n${titleFontCss}\n${css}
      `}
    />,
  );
  return `<!doctype html>${markup}`;
}

export async function renderStorytellerMemoHtml(
  memo: PlayerMemo,
  options: RenderStorytellerHtmlOptions = {},
): Promise<string> {
  if (memo.nightSheet === null) {
    throw new Error("Для памятки рассказчика необходимы данные порядка ночи.");
  }
  const [css, memoFont, titleFont, minionMarker, demonMarker, layoutScript] =
    await Promise.all([
      readFile(new URL("./print.css", import.meta.url), "utf8"),
      readFile(new URL("./fonts/Dumbledor3Thin.ttf", import.meta.url)),
      readFile(new URL("./fonts/ACharmingFontExpanded.ttf", import.meta.url)),
      readFile(new URL("../../assets/night/minion.webp", import.meta.url)),
      readFile(new URL("../../assets/night/demon.webp", import.meta.url)),
      readFile(
        new URL("./storyteller-page-layout.js", import.meta.url),
        "utf8",
      ),
    ]);
  const locale = options.locale ?? "ru";
  const baseCopy = locale.toLowerCase().startsWith("ru")
    ? RUSSIAN_COPY
    : ENGLISH_COPY;
  const copy: Copy = {
    ...baseCopy,
    markerImages: {
      minioninfo: `data:image/webp;base64,${minionMarker.toString("base64")}`,
      demoninfo: `data:image/webp;base64,${demonMarker.toString("base64")}`,
    },
  };
  const fontCss = `@font-face {
    font-family: "Memo Dumbledor";
    src: url("data:font/ttf;base64,${memoFont.toString("base64")}") format("truetype");
    font-style: normal;
    font-weight: 400;
    font-display: block;
  }
  @font-face {
    font-family: "Memo Charming Test";
    src: url("data:font/ttf;base64,${titleFont.toString("base64")}") format("truetype");
    font-style: normal;
    font-weight: 400;
    font-display: block;
  }`;
  const markup = renderToStaticMarkup(
    <StorytellerDocument
      memo={memo}
      locale={locale}
      copy={copy}
      layoutScript={layoutScript}
      css={`
        ${fontCss}\n${css}
      `}
    />,
  );
  return `<!doctype html>${markup}`;
}

function MemoDocument(props: {
  readonly memo: PlayerMemo;
  readonly pages: readonly MemoPage[];
  readonly locale: string;
  readonly copy: Copy;
  readonly subtitle: string | null;
  readonly css: string;
  readonly nightTableScript: string;
  readonly rolePageScript: string;
}): ReactElement {
  const {
    memo,
    pages,
    locale,
    copy,
    subtitle,
    css,
    nightTableScript,
    rolePageScript,
  } = props;
  const title = memo.title ?? "Без названия";
  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        <main className="memo-document">
          {pages.map((page, index) => (
            <MemoPageView
              key={index}
              memo={memo}
              page={page}
              pageIndex={index}
              copy={copy}
              subtitle={subtitle}
            />
          ))}
          {memo.nightSheet === null ? null : (
            <NightSheetPage memo={memo} sheet={memo.nightSheet} copy={copy} />
          )}
        </main>
        <script dangerouslySetInnerHTML={{ __html: rolePageScript }} />
        {memo.nightSheet === null ? null : (
          <script dangerouslySetInnerHTML={{ __html: nightTableScript }} />
        )}
      </body>
    </html>
  );
}

function StorytellerDocument(props: {
  readonly memo: PlayerMemo;
  readonly locale: string;
  readonly copy: Copy;
  readonly layoutScript: string;
  readonly css: string;
}): ReactElement {
  const { memo, locale, copy, layoutScript, css } = props;
  const sheet = memo.nightSheet;
  if (sheet === null) {
    throw new Error("Для памятки рассказчика необходимы данные порядка ночи.");
  }
  const title = memo.title ?? "Без названия";
  const roles = new Map(
    memo.sections.flatMap((section) =>
      section.cards.map((card) => [card.id, card] as const),
    ),
  );
  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${copy.storytellerMemo}: ${title}`}</title>
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        <main className="memo-document storyteller-document">
          <StorytellerPage
            memo={memo}
            label={copy.firstNight}
            night="first"
            items={sheet.firstNight}
            roles={roles}
            copy={copy}
          />
          <StorytellerPage
            memo={memo}
            label={copy.otherNight}
            night="other"
            items={sheet.otherNight}
            roles={roles}
            copy={copy}
          />
        </main>
        <script dangerouslySetInnerHTML={{ __html: layoutScript }} />
      </body>
    </html>
  );
}

function StorytellerPage(props: {
  readonly memo: PlayerMemo;
  readonly label: string;
  readonly night: "first" | "other";
  readonly items: readonly NightOrderItem[];
  readonly roles: ReadonlyMap<string, RoleCard>;
  readonly copy: Copy;
}): ReactElement {
  const { memo, label, night, items, roles, copy } = props;
  return (
    <article
      className="memo-page memo-page--storyteller"
      data-storyteller-night={night}
      data-storyteller-fit-state="pending"
    >
      <header
        className="page-header storyteller-page-header"
        data-overflow-watch
      >
        <div className="script-mark" aria-hidden="true">
          {memo.logo === null ? null : <img src={memo.logo} alt="" />}
        </div>
        <div className="title-block">
          <h1>{memo.title ?? "Без названия"}</h1>
          <p className="storyteller-page-subtitle">{`${copy.storytellerMemo} - ${label}`}</p>
        </div>
      </header>
      <ol className="storyteller-order" data-overflow-watch>
        {items.map((item, index) => (
          <StorytellerOrderRow
            key={
              item.kind === "role"
                ? `${item.roleId}-${index}`
                : `${item.id}-${index}`
            }
            item={item}
            night={night}
            roles={roles}
            copy={copy}
          />
        ))}
      </ol>
    </article>
  );
}

function StorytellerOrderRow(props: {
  readonly item: NightOrderItem;
  readonly night: "first" | "other";
  readonly roles: ReadonlyMap<string, RoleCard>;
  readonly copy: Copy;
}): ReactElement {
  const { item, night, roles, copy } = props;
  if (item.kind === "marker") {
    return (
      <li
        className="storyteller-order-row storyteller-order-row--marker"
        data-storyteller-kind="marker"
        data-marker-id={item.id}
      >
        <span className="storyteller-order-icon" aria-hidden="true">
          <NightMarkerIcon
            id={item.id}
            image={copy.markerImages?.[item.id] ?? null}
          />
        </span>
        <span className="storyteller-order-name">
          {copy.markerLabels[item.id]}
        </span>
        <NightStroke />
        <p className="storyteller-order-reminder">
          <RichTextView value={copy.markerReminders[item.id]} />
        </p>
      </li>
    );
  }
  const role = roles.get(item.roleId);
  const reminder =
    night === "first"
      ? (role?.firstNightReminder ?? null)
      : (role?.otherNightReminder ?? null);
  return (
    <li
      className={`storyteller-order-row storyteller-order-row--role${
        role === undefined ? "" : ` team-${role.team}`
      }`}
      data-storyteller-kind="role"
      data-night-role-id={item.roleId}
    >
      <span className="storyteller-order-icon" aria-hidden="true">
        <NightRoleIcon card={role} side={night} />
      </span>
      <span className="storyteller-order-name">
        {role === undefined ? item.roleId : <RichTextView value={role.name} />}
      </span>
      <NightStroke />
      <p className="storyteller-order-reminder">
        {reminder === null ? null : (
          <RichTextView
            value={reminder}
            remapAbilityColors
            renderReminderMarkers
            normalizeBoldCase
          />
        )}
      </p>
    </li>
  );
}

function MemoPageView(props: {
  readonly memo: PlayerMemo;
  readonly page: MemoPage;
  readonly pageIndex: number;
  readonly copy: Copy;
  readonly subtitle: string | null;
}): ReactElement {
  const { memo, page, pageIndex, copy, subtitle } = props;
  const title = memo.title ?? "Без названия";
  return (
    <article
      className={`memo-page ${pageIndex === 0 ? "memo-page--first" : "memo-page--continuation"}`}
      data-page-role-count={page.roleCount}
      data-role-fit-state="pending"
    >
      <span className="role-size-probe" hidden />
      <header className="page-header" data-overflow-watch>
        <div className="script-mark" aria-hidden="true">
          {memo.logo === null ? null : <img src={memo.logo} alt="" />}
        </div>
        <div className="title-block">
          <h1>{title}</h1>
          {subtitle === null ? null : (
            <p className="title-subtitle">{subtitle}</p>
          )}
        </div>
      </header>

      <div className="page-sections" data-overflow-watch>
        {page.sections.map((section, index) => (
          <RoleSectionView
            key={`${section.team}-${index}`}
            section={section}
            copy={copy}
          />
        ))}
      </div>

      <footer className="page-footer" data-overflow-watch>
        <span className="night-legend">{copy.nightLegend}</span>
      </footer>
    </article>
  );
}

function NightSheetPage(props: {
  readonly memo: PlayerMemo;
  readonly sheet: NightSheet;
  readonly copy: Copy;
}): ReactElement {
  const { memo, sheet, copy } = props;
  const title = memo.title ?? "Без названия";
  const roles = new Map(
    memo.sections.flatMap((section) =>
      section.cards.map((card) => [card.id, card] as const),
    ),
  );
  return (
    <article className="memo-page memo-page--night" data-night-sheet>
      <header className="night-page-header" data-overflow-watch>
        <h1>{title}</h1>
      </header>
      <div className="night-layout" data-overflow-watch>
        <NightOrderView
          side="first"
          label={copy.firstNight}
          items={sheet.firstNight}
          roles={roles}
          copy={copy}
        />
        <div className="night-center">
          <BootleggerView
            card={roles.get("bootlegger")}
            rules={sheet.bootlegger ?? []}
          />
          <JinxesView jinxes={sheet.jinxes} roles={roles} copy={copy} />
        </div>
        <NightOrderView
          side="other"
          label={copy.otherNight}
          items={sheet.otherNight}
          roles={roles}
          copy={copy}
        />
      </div>
      <figure
        className="night-player-table"
        data-fit-state="pending"
        data-overflow-watch
      >
        <img
          src={copy.playerCountsImage}
          width={2162}
          height={727}
          alt="Распределение ролей по количеству игроков"
        />
        <figcaption>
          Недостаточно места для таблицы. Уменьшите размеры ночного порядка или
          текста правил и сглазов.
        </figcaption>
      </figure>
    </article>
  );
}

function NightOrderView(props: {
  readonly side: "first" | "other";
  readonly label: string;
  readonly items: readonly NightOrderItem[];
  readonly roles: ReadonlyMap<string, RoleCard>;
  readonly copy: Copy;
}): ReactElement {
  const { side, label, items, roles, copy } = props;
  return (
    <section
      className={`night-side night-side--${side}`}
      data-night-list={side === "first" ? "firstNight" : "otherNight"}
    >
      <h2 className="night-side-heading">{label}</h2>
      <ol className="night-order">
        {items.map((item, index) => (
          <NightOrderRow
            key={
              item.kind === "role"
                ? `${item.roleId}-${index}`
                : `${item.id}-${index}`
            }
            item={item}
            side={side}
            roles={roles}
            copy={copy}
          />
        ))}
      </ol>
    </section>
  );
}

function NightOrderRow(props: {
  readonly item: NightOrderItem;
  readonly side: "first" | "other";
  readonly roles: ReadonlyMap<string, RoleCard>;
  readonly copy: Copy;
}): ReactElement {
  const { item, side, roles, copy } = props;
  if (item.kind === "marker") {
    return (
      <li
        className="night-order-row night-order-row--marker"
        data-night-order-kind="marker"
        data-marker-id={item.id}
      >
        <NightStroke />
        <span className="night-order-name">{copy.markerLabels[item.id]}</span>
        <NightMarkerIcon
          id={item.id}
          image={copy.markerImages?.[item.id] ?? null}
        />
      </li>
    );
  }
  const role = roles.get(item.roleId);
  return (
    <li
      className={`night-order-row night-order-row--role${role === undefined ? "" : ` team-${role.team}`}`}
      data-night-order-kind="role"
      data-night-role-id={item.roleId}
    >
      <NightStroke />
      <span className="night-order-name">
        {role === undefined ? item.roleId : <RichTextView value={role.name} />}
      </span>
      <NightRoleIcon card={role} side={side} />
    </li>
  );
}

function NightStroke(): ReactElement {
  return <span className="night-team-stroke" aria-hidden="true" />;
}

function NightRoleIcon(props: {
  readonly card: RoleCard | undefined;
  readonly side: "first" | "other";
}): ReactElement {
  const { card, side } = props;
  return (
    <span className="night-role-icon" aria-hidden="true" data-icon-side={side}>
      {card === undefined || card.image === null ? null : (
        <img src={card.image} alt="" />
      )}
    </span>
  );
}

function NightMarkerIcon(props: {
  readonly id: NightMarkerId;
  readonly image: string | null;
}): ReactElement {
  const { id, image } = props;
  if ((id === "minioninfo" || id === "demoninfo") && image !== null) {
    return (
      <span
        className={`night-marker-icon night-marker-icon--${id}`}
        aria-hidden="true"
      >
        <img src={image} alt="" />
      </span>
    );
  }

  const marker =
    id === "dusk" ? (
      <path d="M15.9 2.7a9.3 9.3 0 1 0 5.4 14.5A7.6 7.6 0 0 1 15.9 2.7Z" />
    ) : id === "dawn" ? (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M19.8 4.2l-2.1 2.1M6.3 17.7l-2.1 2.1" />
      </>
    ) : null;
  return (
    <span
      className={`night-marker-icon night-marker-icon--${id}`}
      aria-hidden="true"
    >
      {marker === null ? null : <svg viewBox="0 0 24 24">{marker}</svg>}
    </span>
  );
}

function BootleggerView(props: {
  readonly card: RoleCard | undefined;
  readonly rules: readonly RichText[];
}): ReactElement | null {
  const { card, rules } = props;
  if (card === undefined || rules.length === 0) return null;

  return (
    <section className="night-bootlegger" data-bootlegger>
      <h2>
        <RichTextView value={card.name} />
      </h2>
      {rules.map((rule, index) => (
        <p key={index}>
          <RichTextView value={rule} remapAbilityColors />
        </p>
      ))}
    </section>
  );
}

function JinxesView(props: {
  readonly jinxes: readonly ActiveJinx[];
  readonly roles: ReadonlyMap<string, RoleCard>;
  readonly copy: Copy;
}): ReactElement {
  const { jinxes, roles, copy } = props;
  return (
    <section className="night-jinxes" data-jinxes>
      <h2>{copy.jinxes}</h2>
      <div className="jinx-list">
        {jinxes.map((jinx, index) => (
          <JinxView
            key={`${jinx.roleIds.join("-")}-${index}`}
            jinx={jinx}
            roles={roles}
          />
        ))}
      </div>
    </section>
  );
}

function JinxView(props: {
  readonly jinx: ActiveJinx;
  readonly roles: ReadonlyMap<string, RoleCard>;
}): ReactElement {
  const { jinx, roles } = props;
  const first = roles.get(jinx.roleIds[0]);
  const second = roles.get(jinx.roleIds[1]);
  return (
    <article className="jinx-item" data-jinx-role-ids={jinx.roleIds.join(",")}>
      <div className="jinx-icons" aria-hidden="true">
        <NightRoleIcon card={first} side="first" />
        <span className="jinx-link" />
        <NightRoleIcon card={second} side="other" />
      </div>
      <p>
        <RichTextView value={jinx.reason} remapAbilityColors />
      </p>
    </article>
  );
}

function RoleSectionView(props: {
  readonly section: PageSection;
  readonly copy: Copy;
}): ReactElement {
  const { section, copy } = props;
  const splitAt = Math.ceil(section.cards.length / 2);
  const columns = [
    section.cards.slice(0, splitAt),
    section.cards.slice(splitAt),
  ];
  return (
    <section
      className={`role-section team-${section.team}`}
      data-team={section.team}
    >
      <h2 className="section-heading">
        <span>{copy.teamLabels[section.team]}</span>
        {section.continued ? <small>{copy.continued}</small> : null}
      </h2>
      <div className="section-body">
        <div className="section-columns">
          {columns.map((cards, columnIndex) => (
            <div className="section-column" key={columnIndex}>
              {cards.map((card) => (
                <RoleCardView key={card.id} card={card} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RoleCardView({ card }: { readonly card: RoleCard }): ReactElement {
  return (
    <article className={`role-card team-${card.team}`} data-role-id={card.id}>
      <div className="role-icon" aria-hidden="true">
        {card.image === null ? null : <img src={card.image} alt="" />}
      </div>
      <div className="role-copy">
        <h3 className="role-name">
          <RichTextView value={card.name} />
        </h3>
        <p className="role-ability">
          <RichTextView value={card.ability} remapAbilityColors />
        </p>
      </div>
    </article>
  );
}

function RichTextView({
  value,
  remapAbilityColors = false,
  renderReminderMarkers = false,
  normalizeBoldCase = false,
}: {
  readonly value: RichText;
  readonly remapAbilityColors?: boolean;
  readonly renderReminderMarkers?: boolean;
  readonly normalizeBoldCase?: boolean;
}): ReactElement {
  return (
    <>
      {value.runs.map((run, index) => {
        const style: CSSProperties =
          run.style.color === null
            ? {}
            : {
                color: remapAbilityColors
                  ? mapAbilityColor(run.style.color)
                  : run.style.color,
              };
        const text =
          normalizeBoldCase && run.style.bold
            ? normalizeAllCaps(run.text)
            : run.text;
        const parts = renderReminderMarkers
          ? text.split(/(:reminder:)/g)
          : [text];
        const content = parts.map((part, partIndex) =>
          part === ":reminder:" ? (
            <span
              className="storyteller-reminder-marker"
              aria-label="метка"
              key={partIndex}
            >
              ●
            </span>
          ) : (
            part
          ),
        );
        return run.style.bold ? (
          <strong key={index} style={style}>
            {content}
          </strong>
        ) : (
          <span key={index} style={style}>
            {content}
          </span>
        );
      })}
    </>
  );
}

function normalizeAllCaps(value: string): string {
  if (!/\p{L}/u.test(value) || value !== value.toLocaleUpperCase()) {
    return value;
  }
  return value
    .toLocaleLowerCase()
    .replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase());
}

function mapAbilityColor(color: string): string {
  if (color.toUpperCase() === "#3297F4") {
    return "var(--role-good-highlight-color)";
  }
  if (color.toUpperCase() === "#8C0E12") {
    return "var(--role-evil-highlight-color)";
  }
  return color;
}
