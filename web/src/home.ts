import type { ProjectRecord } from "../../src/project/records";
import { api } from "./api";
import { esc, h } from "./dom";
import { ago } from "./status";

/** The prompt box and the list of recent projects. Returns its cleanup. */
export function renderHome(app: HTMLElement): () => void {
  app.replaceChildren(
    h(`
    <main>
      <section class="hero">
        <h1>What if…</h1>
        <form id="ask" autocomplete="off">
          <input id="prompt" name="prompt" placeholder="your cheeks double in size every hour, pixel art" autofocus />
        </form>
        <div class="error-line" id="err"></div>
      </section>
      <section class="recent" id="recent"></section>
    </main>`),
  );

  const form = app.querySelector<HTMLFormElement>("#ask")!;
  const input = app.querySelector<HTMLInputElement>("#prompt")!;
  const err = app.querySelector<HTMLElement>("#err")!;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.textContent = "";
    input.disabled = true;
    try {
      const p = await api<ProjectRecord>("/api/projects", { method: "POST", json: { prompt: input.value } });
      location.hash = `#/p/${p.id}`;
    } catch (e2) {
      err.textContent = (e2 as Error).message;
      input.disabled = false;
      input.focus();
    }
  });

  const recent = app.querySelector<HTMLElement>("#recent")!;
  api<ProjectRecord[]>("/api/projects")
    .then((list) => {
      if (!list.length) return;
      recent.innerHTML = `<h2>Recent</h2>${list.map(recentRow).join("")}`;
    })
    .catch(() => undefined);

  return () => undefined;
}

function recentRow(p: ProjectRecord): string {
  const dots = p.variants
    .map((v) => `<i class="${v.status === "ready" ? "ready" : v.status === "error" ? "error" : "busy"}"></i>`)
    .join("");
  return `<a href="#/p/${p.id}"><span class="p">${esc(p.prompt)}<span class="dots">${dots}</span></span><span class="when">${ago(p.createdAt)}</span></a>`;
}
