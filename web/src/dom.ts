export { escapeHtml as esc } from "../../src/shared/text";

/** The single element an HTML string describes. */
export function h(html: string): HTMLElement {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

/** Copy to the clipboard and flash "Copied" on the button. */
export function copyText(text: string, button: HTMLElement): void {
  const done = () => {
    const was = button.textContent;
    button.textContent = "Copied";
    window.setTimeout(() => (button.textContent = was), 1400);
  };
  navigator.clipboard?.writeText(text).then(done, () => {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    done();
  });
}

/** Only one take plays at a time: when one starts, the others pause. */
export function installPlayerCoordination(frames: () => HTMLIFrameElement[]): () => void {
  const onMessage = (e: MessageEvent<{ source?: string; type?: string; playing?: boolean }>) => {
    if (e.data?.source !== "hpg-player" || e.data.type !== "state" || !e.data.playing) return;
    for (const f of frames()) {
      if (f.contentWindow && f.contentWindow !== e.source) {
        f.contentWindow.postMessage({ source: "hpg-dashboard", type: "pause" }, "*");
      }
    }
  };
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}
