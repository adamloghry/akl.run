import { always } from "@antithesishq/bombadil";
import { actions, extract, registerCustomAction } from "@antithesishq/bombadil/browser";

export {
  defaultActions,
  noConsoleErrors,
  noUncaughtExceptions,
  noUnhandledPromiseRejections,
} from "@antithesishq/bombadil/browser/defaults";

const page = extract(({ document, window }) => {
  const root = document.documentElement;
  const hub = document.querySelector("[data-windows]");
  const journal = document.querySelector("[data-journal]");
  const readout = document.querySelector("[data-readout]");
  const canvas = document.querySelector("#map") as HTMLCanvasElement | null;
  return {
    width: window.innerWidth,
    scrollWidth: root.scrollWidth,
    factory: root.classList.contains("factory"),
    superminimized: root.classList.contains("superminimized"),
    hubInert: hub?.hasAttribute("inert") ?? null,
    journalInert: journal?.hasAttribute("inert") ?? null,
    readoutPressed: readout?.getAttribute("aria-pressed") ?? null,
    canvasPixels: canvas ? canvas.width * canvas.height : 0,
  };
});

export const noHorizontalOverflow = always(() => page.current.scrollWidth <= page.current.width + 1);
export const modeControlsAgree = always(() => {
  const p = page.current;
  return p.hubInert === p.factory && p.readoutPressed === String(p.factory);
});
export const superminimizeStaysInFactory = always(() => {
  const p = page.current;
  return (!p.superminimized || p.factory) && p.journalInert === p.superminimized;
});
export const canvasStaysWithinPixelBudget = always(() => page.current.canvasPixels <= 4_010_000);

const shortcut = registerCustomAction("shortcut", async (_document, window, key: string) => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
});
export const shortcuts = actions(() => [shortcut("m"), shortcut("s"), shortcut("r")]);

export const viewportChanges = actions(() => [
  { SetViewport: { width: 360, height: 640 } },
  { SetViewport: { width: 800, height: 900 } },
  { SetViewport: { width: 1440, height: 900 } },
]);
