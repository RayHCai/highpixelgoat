import type { Browser, Page } from "playwright";
import { launchBrowser, openPlayer, serveFolder, type ServedFolder } from "../render/capture";
import type { CoreSpec } from "../take/core";
import type { TakeContext } from "../take/folder";

/** One agent run over one take: its browser, its served folder and whether anything was written. */
export class TakeSession {
  /** True once the agent has written anything; a chat turn that only answers leaves the take as it was. */
  changed = false;
  private browser: Browser | null = null;
  private site: ServedFolder | null = null;

  constructor(readonly ctx: TakeContext) {}

  get dir(): string {
    return this.ctx.dir;
  }

  activity(text: string): void {
    this.ctx.onActivity(text);
  }

  /** Open the built take in capture mode, starting the browser and the server on first use. */
  async openPlayer(spec: CoreSpec, onError: (message: string) => void): Promise<Page> {
    this.site ??= await serveFolder(this.dir);
    this.browser ??= await launchBrowser();
    return openPlayer(this.browser, `${this.site.url}/index.html?capture=1`, spec, onError);
  }

  async close(): Promise<void> {
    await this.browser?.close().catch(() => undefined);
    await this.site?.close().catch(() => undefined);
    this.browser = null;
    this.site = null;
  }
}
