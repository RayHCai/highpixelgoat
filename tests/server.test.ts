import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

// The API is exercised without Claude, a voice, Vite or a dashboard build.
process.env.HPG_OFFLINE = "1";
process.env.HPG_TTS = "none";

let base = "";
let close: () => Promise<void> = async () => undefined;

before(async () => {
  const { createApp } = await import("../src/server/app");
  const app = await createApp({ dashboard: "none" });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise((resolve) => server.close(() => resolve()));
});

after(() => close());

async function call(
  method: string,
  path: string,
  json?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: json === undefined ? {} : { "content-type": "application/json" },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

test("health reports offline mode and the silent voice", async () => {
  const { status, body } = await call("GET", "/api/health");
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.offline, true);
  assert.equal(body.claude, null);
  assert.deepEqual(body.voice, { provider: "none", voice: "none" });
});

test("the project list is an array", async () => {
  const { status, body } = await call("GET", "/api/projects");
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
});

test("prompts are validated before anything is created", async () => {
  assert.deepEqual(await call("POST", "/api/projects", { prompt: " a " }), {
    status: 400,
    body: { error: "describe a scenario first" },
  });
  assert.equal((await call("POST", "/api/projects", { prompt: "x".repeat(501) })).status, 400);
  assert.equal((await call("POST", "/api/projects", { prompt: 42 })).status, 400);
});

test("unknown projects, takes and endpoints are 404s with a JSON error", async () => {
  for (const [method, path] of [
    ["GET", "/api/projects/no-such-project-0000"],
    ["GET", "/api/projects/..%2F..%2Fetc"],
    ["GET", "/api/projects/no-such-project-0000/variants/a/chat"],
    ["POST", "/api/projects/no-such-project-0000/variants/a/render"],
    ["GET", "/api/projects/no-such-project-0000/variants/a/video"],
    ["GET", "/api/nothing-here"],
  ] as const) {
    const { status, body } = await call(method, path);
    assert.equal(status, 404, `${method} ${path}`);
    assert.equal(typeof body.error, "string", `${method} ${path}`);
  }
});

test("requests are refused unless addressed to localhost and, when they change something, sent from it", async () => {
  const { requestRefusal, isLoopback } = await import("../src/server/origin");
  const local = { loopbackOnly: true };
  assert.equal(requestRefusal({ method: "GET", host: "localhost:5173", origin: undefined }, local), null);
  assert.equal(requestRefusal({ method: "GET", host: "[::1]:5173", origin: undefined }, local), null);
  assert.equal(
    requestRefusal({ method: "POST", host: "127.0.0.1:5173", origin: "http://127.0.0.1:5173" }, local),
    null,
  );
  // DNS rebinding: the page's own name arrives as the Host.
  assert.match(
    requestRefusal({ method: "GET", host: "evil.example:5173", origin: undefined }, local) ?? "",
    /localhost/,
  );
  assert.equal(
    requestRefusal({ method: "GET", host: "192.168.1.5:5173", origin: undefined }, { loopbackOnly: false }),
    null,
  );
  // Cross-site posts, including from sandboxed frames.
  for (const origin of ["https://evil.example", "http://localhost:5174", "null"]) {
    assert.match(requestRefusal({ method: "POST", host: "localhost:5173", origin }, local) ?? "", /refused/, origin);
  }
  assert.match(requestRefusal({ method: "GET", host: undefined, origin: undefined }, local) ?? "", /Host/);
  for (const h of ["127.0.0.1", "localhost", "::1", "127.0.0.2"]) assert.equal(isLoopback(h), true, h);
  for (const h of ["0.0.0.0", "192.168.1.5", "example.com"]) assert.equal(isLoopback(h), false, h);
});

test("the API refuses a foreign Host and cross-site posts", async () => {
  const { request } = await import("node:http");
  const url = new URL(base);
  const status = (method: string, headers: Record<string, string>) =>
    new Promise<number>((resolve, reject) => {
      const req = request({ host: url.hostname, port: url.port, path: "/api/projects", method, headers }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on("error", reject);
      req.end(method === "POST" ? JSON.stringify({ prompt: "x" }) : undefined);
    });
  assert.equal(await status("GET", { host: `evil.example:${url.port}` }), 403);
  const json = { "content-type": "application/json" };
  assert.equal(await status("POST", { ...json, origin: "https://evil.example" }), 403);
  // Same origin reaches validation (a one-letter prompt is a 400).
  assert.equal(await status("POST", { ...json, origin: base }), 400);
  assert.equal((await call("POST", "/api/quit")).status, 404);
});
