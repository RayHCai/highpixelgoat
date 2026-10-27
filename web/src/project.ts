import {
  isVideoBusy,
  type ChatMessage,
  type ProjectRecord,
  type VariantId,
  type VariantRecord,
} from "../../src/project/records";
import { api } from "./api";
import { copyText, esc, h, installPlayerCoordination } from "./dom";
import { isBusy, renderButtonLabel, STEP_LABEL, studioSubtitle, takeSubtitle } from "./status";

/** Shown on project pages only: the way back to a fresh prompt, then where you are. */
function header(): HTMLElement {
  return h(`<header class="top"><a class="action new" href="#/">← New video</a><span class="crumb"></span></header>`);
}

interface CardRefs {
  root: HTMLElement;
  phone: HTMLElement;
  meta: HTMLElement;
  pick: HTMLElement | null;
  iframe: HTMLIFrameElement | null;
  loadedAt: string | null;
}

function siteUrl(id: string, v: VariantRecord): string {
  return `/out/${id}/${v.id}/index.html?v=${encodeURIComponent(v.builtAt ?? v.updatedAt)}`;
}

function makeCard(projectId: string, v: VariantRecord, pickable: boolean): CardRefs {
  const root = h(`
    <article class="card" data-v="${v.id}">
      <div class="phone"></div>
      ${pickable ? `<footer><div class="meta"></div><a class="action pick" href="#/p/${projectId}/${v.id}">Select</a></footer>` : ""}
    </article>`);
  const refs: CardRefs = {
    root,
    phone: root.querySelector(".phone")!,
    meta: root.querySelector(".meta") ?? document.createElement("div"),
    pick: root.querySelector<HTMLElement>(".pick"),
    iframe: null,
    loadedAt: null,
  };
  refs.pick?.addEventListener("click", () => {
    void api(`/api/projects/${projectId}/select`, { method: "POST", json: { variant: v.id } }).catch(() => undefined);
  });
  return refs;
}

function patchCard(projectId: string, refs: CardRefs, v: VariantRecord): void {
  const label = `Take ${v.id.toUpperCase()}`;
  refs.meta.innerHTML = `<strong>${esc(v.status === "ready" && v.title ? v.title : label)}</strong><span class="sub">${esc(takeSubtitle(v))}</span>`;
  if (refs.pick) refs.pick.style.visibility = v.status === "ready" ? "visible" : "hidden";

  if (v.status === "ready") {
    const stamp = v.builtAt ?? v.updatedAt;
    if (!refs.iframe || refs.loadedAt !== stamp) {
      const iframe = document.createElement("iframe");
      iframe.src = siteUrl(projectId, v);
      iframe.title = v.title ?? label;
      iframe.allow = "autoplay";
      refs.phone.replaceChildren(iframe);
      refs.iframe = iframe;
      refs.loadedAt = stamp;
    }
    return;
  }
  refs.iframe = null;
  refs.loadedAt = null;
  const skeleton =
    v.status === "error"
      ? `<div class="skeleton error"><div>${esc(v.error ?? "Something went wrong")}</div></div>`
      : `<div class="skeleton"><div class="spinner"></div><div>${esc(v.activity ?? STEP_LABEL[v.status])}…</div></div>`;
  refs.phone.innerHTML = skeleton;
}

/** A project page: the take with its chat (studio), or a grid for old three-take projects. Returns its cleanup. */
export function renderProject(app: HTMLElement, id: string, selected: VariantId | null): () => void {
  let project: ProjectRecord | null = null;
  let timer: number | null = null;
  let stopped = false;
  const cards = new Map<VariantId, CardRefs>();
  const cleanups: (() => void)[] = [];

  const main = h(`<main></main>`);
  app.replaceChildren(header(), main);
  const crumb = app.querySelector<HTMLElement>(".crumb")!;

  const refresh = async (): Promise<void> => {
    timer = null;
    try {
      project = await api<ProjectRecord>(`/api/projects/${id}`);
    } catch (e) {
      main.innerHTML = `<section class="hero"><h1>Not found</h1><p>${esc((e as Error).message)}</p><a class="action" href="#/">Start over</a></section>`;
      return;
    }
    if (stopped) return;
    paint(project);
    if (isBusy(project)) timer = window.setTimeout(refresh, 1500);
  };

  let built = false;
  const paint = (p: ProjectRecord): void => {
    // A project has one take now; older projects with three still get the grid.
    const single = p.variants.length === 1 ? p.variants[0]!.id : null;
    const vid = selected ?? single;
    crumb.innerHTML =
      selected && !single
        ? `<a href="#/p/${p.id}">${esc(p.prompt)}</a> / take ${selected.toUpperCase()}`
        : esc(p.prompt);
    if (!built) {
      built = true;
      if (vid) buildStudio(p, vid);
      else buildGrid(p);
    }
    for (const v of p.variants) {
      const refs = cards.get(v.id);
      if (refs) patchCard(p.id, refs, v);
    }
    studioPatch?.(p);
  };

  const buildGrid = (p: ProjectRecord): void => {
    const grid = h(`<section class="grid"></section>`);
    for (const v of p.variants) {
      const refs = makeCard(p.id, v, true);
      cards.set(v.id, refs);
      grid.appendChild(refs.root);
    }
    main.replaceChildren(grid);
    cleanups.push(installPlayerCoordination(() => [...cards.values()].flatMap((c) => (c.iframe ? [c.iframe] : []))));
  };

  let studioPatch: ((p: ProjectRecord) => void) | null = null;
  const buildStudio = (p: ProjectRecord, vid: VariantId): void => {
    const v0 = p.variants.find((x) => x.id === vid);
    if (!v0) {
      location.hash = `#/p/${p.id}`;
      return;
    }
    const refs = makeCard(p.id, v0, false);
    cards.set(vid, refs);
    const studio = h(`
      <section class="studio">
        <div class="stage">
          <div class="caption-block" id="caption" hidden>
            <div class="label"><span>Instagram caption</span><button class="action" id="copy" type="button">Copy</button></div>
            <div class="text"></div>
            <div class="tags"></div>
          </div>
        </div>
        <aside class="panel">
          <header>
            <div class="meta"><strong></strong><span class="sub"></span></div>
            <button class="btn" id="render"><span class="bar"></span><span class="label">Render video</span></button>
          </header>
          <div class="messages" id="messages"></div>
          <form class="composer" id="composer">
            <textarea id="say" rows="1" placeholder="Ask Claude for changes. Enter to send."></textarea>
          </form>
        </aside>
      </section>`);
    const stage = studio.querySelector(".stage")!;
    stage.insertBefore(refs.root, stage.firstChild);
    main.replaceChildren(studio);

    const title = studio.querySelector<HTMLElement>(".panel .meta strong")!;
    const sub = studio.querySelector<HTMLElement>(".panel .meta .sub")!;
    const renderBtn = studio.querySelector<HTMLButtonElement>("#render")!;
    const bar = renderBtn.querySelector<HTMLElement>(".bar")!;
    const label = renderBtn.querySelector<HTMLElement>(".label")!;
    const messages = studio.querySelector<HTMLElement>("#messages")!;
    const composer = studio.querySelector<HTMLFormElement>("#composer")!;
    const say = studio.querySelector<HTMLTextAreaElement>("#say")!;
    const captionBlock = studio.querySelector<HTMLElement>("#caption")!;
    const captionText = captionBlock.querySelector<HTMLElement>(".text")!;
    const captionTags = captionBlock.querySelector<HTMLElement>(".tags")!;
    const copyBtn = captionBlock.querySelector<HTMLElement>("#copy")!;
    let instagram = "";
    copyBtn.addEventListener("click", () => copyText(instagram, copyBtn));

    const addMessage = (role: "user" | "assistant", text: string, cls = ""): HTMLElement => {
      messages.querySelector(".empty")?.remove();
      const node = h(`<div class="msg ${role} ${cls}"></div>`);
      node.textContent = text;
      messages.appendChild(node);
      messages.scrollTop = messages.scrollHeight;
      return node;
    };

    api<{ messages: ChatMessage[] }>(`/api/projects/${p.id}/variants/${vid}/chat`)
      .then(({ messages: history }) => {
        if (!history.length) {
          messages.innerHTML = `<div class="empty">Ask for anything: a new place, a camera move, a character who acts, a cut, a different narrator, any line.</div>`;
          return;
        }
        for (const m of history) addMessage(m.role, m.content);
      })
      .catch(() => undefined);

    let sending = false;
    const setSending = (s: boolean): void => {
      sending = s;
      say.disabled = s;
    };
    composer.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = say.value.trim();
      if (!text || sending) return;
      say.value = "";
      say.style.height = "";
      addMessage("user", text);
      const pending = addMessage("assistant", "Editing…", "pending");
      setSending(true);
      // Claude edits the take folder for a while; show what it is doing as it goes.
      const watch = window.setInterval(() => {
        const activity = project?.variants.find((x) => x.id === vid)?.activity;
        if (activity) pending.textContent = `${activity}…`;
        if (!timer) void refresh();
      }, 1500);
      try {
        const r = await api<{ reply: string; changed: boolean; project: ProjectRecord }>(
          `/api/projects/${p.id}/variants/${vid}/chat`,
          {
            method: "POST",
            json: { message: text },
          },
        );
        pending.classList.remove("pending");
        pending.textContent = r.reply;
        paint(r.project);
      } catch (e2) {
        pending.classList.remove("pending");
        pending.classList.add("failed");
        pending.textContent = (e2 as Error).message;
      } finally {
        window.clearInterval(watch);
        setSending(false);
        say.focus();
        if (!timer) void refresh();
      }
    });
    say.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        composer.requestSubmit();
      }
    });
    say.addEventListener("input", () => {
      say.style.height = "auto";
      say.style.height = `${Math.min(140, say.scrollHeight)}px`;
    });

    renderBtn.addEventListener("click", async () => {
      const v = project?.variants.find((x) => x.id === vid);
      if (!v) return;
      if (v.video.status === "ready") {
        location.href = `/api/projects/${p.id}/variants/${vid}/video`;
        return;
      }
      if (isVideoBusy(v.video)) return;
      renderBtn.disabled = true;
      try {
        await api(`/api/projects/${p.id}/variants/${vid}/render`, { method: "POST" });
        if (!timer) void refresh();
      } catch (e2) {
        label.textContent = (e2 as Error).message;
        renderBtn.disabled = false;
      }
    });

    studioPatch = (pp: ProjectRecord): void => {
      const v = pp.variants.find((x) => x.id === vid);
      if (!v) return;
      title.textContent = v.title ?? `Take ${vid.toUpperCase()}`;
      sub.textContent = studioSubtitle(v);
      const video = v.video;
      bar.style.width = video.status === "rendering" ? `${Math.round(video.progress * 100)}%` : "0";
      renderBtn.disabled = v.status !== "ready" || isVideoBusy(video);
      renderBtn.title = video.status === "error" ? (video.error ?? "") : "";
      label.textContent = renderButtonLabel(video);
      if (v.status === "ready" && v.caption) {
        captionBlock.hidden = false;
        captionText.textContent = v.caption;
        captionTags.textContent = (v.hashtags ?? []).map((t) => `#${t}`).join(" ");
        instagram = v.instagram ?? `${v.caption}\n\n${captionTags.textContent}`;
      } else {
        captionBlock.hidden = true;
      }
    };
  };

  void refresh();
  return () => {
    stopped = true;
    if (timer) window.clearTimeout(timer);
    for (const c of cleanups) c();
  };
}
