import { existsSync } from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { DEFAULT_MODEL, describeClaude, offlineMode } from "../agent/config";
import { chat } from "../project/chat";
import { createProject } from "../project/generate";
import { isProjectId, isVariantId, isVideoBusy, type ProjectRecord, type VariantRecord } from "../project/records";
import { requestRender, videoPath } from "../project/render";
import { listProjects, readChat, readProject, readVariant, writeProject } from "../project/store";
import { describeError } from "../shared/errors";
import { OUT_DIR, PROJECT_ROOT, WEB_DIR, WEB_DIST_DIR } from "../shared/paths";
import { slugify } from "../shared/text";
import { DEFAULT_VOICE, getProvider } from "../voice/tts";
import { requestRefusal } from "./origin";

/**
 * The dashboard API plus static serving of the generated sites. The
 * dashboard itself comes from Vite in middleware mode (with HMR) in
 * development, from dist/web in production, and is left out in tests.
 */

export type DashboardMode = "vite" | "static" | "none";

const MAX_PROMPT = 500;
const MAX_MESSAGE = 2000;
const RECENT_PROJECTS = 30;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function findProject(id: unknown): ProjectRecord {
  const project = typeof id === "string" && isProjectId(id) ? readProject(id) : null;
  if (!project) throw new HttpError(404, "no such project");
  return project;
}

function findVariant(id: unknown, v: unknown): { project: ProjectRecord; variant: VariantRecord } {
  const project = findProject(id);
  const found = typeof v === "string" && isVariantId(v) ? readVariant(project.id, v) : null;
  if (!found) throw new HttpError(404, "no such take");
  return found;
}

function bodyText(req: Request, field: string): string {
  const value: unknown = (req.body as Record<string, unknown> | undefined)?.[field];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * `loopbackOnly` (default true) answers only requests addressed to localhost;
 * main.ts turns it off when HOST opens the server to the network.
 */
export async function createApp(o: { dashboard: DashboardMode; loopbackOnly?: boolean }): Promise<express.Express> {
  const app = express();
  app.disable("x-powered-by");
  const loopbackOnly = o.loopbackOnly ?? true;
  app.use((req, _res, next) => {
    const refusal = requestRefusal(
      { method: req.method, host: req.headers.host, origin: req.headers.origin },
      { loopbackOnly },
    );
    next(refusal ? new HttpError(403, refusal) : undefined);
  });
  app.use(express.json({ limit: "256kb" }));

  // Generated sites. Nothing under /out is cached: specs and audio are
  // rewritten in place after every chat edit.
  app.use(
    "/out",
    express.static(OUT_DIR, {
      etag: false,
      lastModified: false,
      cacheControl: false,
      setHeaders: (res) => res.setHeader("cache-control", "no-store"),
    }),
  );

  app.get("/api/health", async (_req, res) => {
    const provider = await getProvider().catch(() => null);
    res.json({
      ok: true,
      offline: offlineMode(),
      claude: offlineMode() ? null : { model: DEFAULT_MODEL, via: describeClaude() },
      voice: provider ? { provider: provider.name, voice: provider.describe(DEFAULT_VOICE) } : null,
    });
  });

  app.get("/api/projects", (_req, res) => {
    res.json(listProjects().slice(0, RECENT_PROJECTS));
  });

  app.post("/api/projects", (req, res) => {
    const prompt = bodyText(req, "prompt").replace(/\s+/g, " ");
    if (prompt.length < 3) throw new HttpError(400, "describe a scenario first");
    if (prompt.length > MAX_PROMPT) throw new HttpError(400, `keep the request under ${MAX_PROMPT} characters`);
    const { project } = createProject(prompt);
    res.status(202).json(project);
  });

  app.get("/api/projects/:id", (req, res) => {
    res.json(findProject(req.params.id));
  });

  app.post("/api/projects/:id/select", (req, res) => {
    const { project, variant } = findVariant(req.params.id, bodyText(req, "variant"));
    project.selected = variant.id;
    writeProject(project);
    res.json(project);
  });

  app.get("/api/projects/:id/variants/:v/chat", (req, res) => {
    const { project, variant } = findVariant(req.params.id, req.params.v);
    res.json({ messages: readChat(project.id, variant.id) });
  });

  app.post("/api/projects/:id/variants/:v/chat", async (req, res) => {
    const { project, variant } = findVariant(req.params.id, req.params.v);
    const message = bodyText(req, "message");
    if (!message) throw new HttpError(400, "say what you would like changed");
    if (message.length > MAX_MESSAGE) throw new HttpError(400, `keep a message under ${MAX_MESSAGE} characters`);
    if (variant.status !== "ready") throw new HttpError(409, "this take is still being built; try again in a moment");
    if (variant.activity) throw new HttpError(409, "Claude is still working on the last message for this take");
    if (isVideoBusy(variant.video)) {
      throw new HttpError(409, "a video of this take is rendering; wait for it to finish before editing");
    }
    const result = await chat(project.id, variant.id, message);
    res.json({ ...result, project: readProject(project.id) });
  });

  app.post("/api/projects/:id/variants/:v/render", (req, res) => {
    const { project, variant } = findVariant(req.params.id, req.params.v);
    try {
      res.status(202).json({ video: requestRender(project.id, variant.id) });
    } catch (err) {
      throw new HttpError(409, describeError(err));
    }
  });

  app.get("/api/projects/:id/variants/:v/video", (req, res) => {
    const { project, variant } = findVariant(req.params.id, req.params.v);
    const file = videoPath(project.id, variant.id);
    if (variant.video.status !== "ready" || !existsSync(file)) throw new HttpError(404, "no video rendered yet");
    res.download(file, `${slugify(variant.title ?? project.id)}.mp4`);
  });

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "no such endpoint")));

  await mountDashboard(app, o.dashboard);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: describeError(err) });
  });

  return app;
}

async function mountDashboard(app: express.Express, mode: DashboardMode): Promise<void> {
  if (mode === "vite") {
    const { createServer } = await import("vite");
    const vite = await createServer({
      configFile: path.join(PROJECT_ROOT, "vite.config.ts"),
      root: WEB_DIR,
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (mode === "static") {
    if (!existsSync(path.join(WEB_DIST_DIR, "index.html"))) {
      throw new Error("dist/web is missing; run `npm run build` first");
    }
    app.use(express.static(WEB_DIST_DIR, { index: "index.html" }));
    app.use((req, res, next) => (req.method === "GET" ? res.sendFile(path.join(WEB_DIST_DIR, "index.html")) : next()));
  }
}
