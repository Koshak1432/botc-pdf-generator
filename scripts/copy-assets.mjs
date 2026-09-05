import { copyFile, mkdir } from "node:fs/promises";

const distRender = new URL("../dist/render/", import.meta.url);
const distFonts = new URL("../dist/render/fonts/", import.meta.url);
await Promise.all([
  mkdir(distRender, { recursive: true }),
  mkdir(distFonts, { recursive: true }),
]);
await Promise.all([
  copyFile(new URL("../src/render/role-page-layout.js", import.meta.url),
    new URL("../dist/render/role-page-layout.js", import.meta.url)),
  copyFile(new URL("../src/render/night-table-layout.js", import.meta.url),
    new URL("../dist/render/night-table-layout.js", import.meta.url)),
  copyFile(
    new URL("../src/render/print.css", import.meta.url),
    new URL("../dist/render/print.css", import.meta.url),
  ),
  copyFile(
    new URL("../src/render/fonts/Dumbledor3Thin.ttf", import.meta.url),
    new URL("../dist/render/fonts/Dumbledor3Thin.ttf", import.meta.url),
  ),
  copyFile(
    new URL("../src/render/fonts/ACharmingFontExpanded.ttf", import.meta.url),
    new URL("../dist/render/fonts/ACharmingFontExpanded.ttf", import.meta.url),
  ),
]);
