import { describeClaude, offlineMode } from "../agent/config";
import { recoverInterrupted } from "../project/store";
import { describeError } from "../shared/errors";
import { DEFAULT_VOICE, getProvider } from "../voice/tts";
import { createApp } from "./app";
import { isLoopback } from "./origin";

/**
 * Dashboard server.
 *
 *   npm run dev       Vite-served dashboard with HMR + API on PORT (5173)
 *   npm start         same API serving the built dashboard from dist/web
 *
 * It listens on HOST (default 127.0.0.1): anyone who can reach it can spend
 * the Claude account it runs with. On loopback it also answers only requests
 * addressed to localhost (see origin.ts). Set HOST=0.0.0.0 to open it to the
 * network, which turns that check off.
 */

const prod = process.argv.includes("--prod");
const port = Number(process.env.PORT ?? 5173);
const host = process.env.HOST ?? "127.0.0.1";

recoverInterrupted();
const app = await createApp({ dashboard: prod ? "static" : "vite", loopbackOnly: isLoopback(host) });
app.listen(port, host, async () => {
  console.log(`highpixelgoat  http://localhost:${port}`);
  if (offlineMode()) console.log("  claude: OFFLINE (HPG_OFFLINE=1), the bundled example scripts stand in");
  else console.log(`  claude: ${describeClaude()}`);
  try {
    const provider = await getProvider();
    console.log(`  voice: ${provider.name} (${provider.describe(DEFAULT_VOICE)} for the default narrator)`);
  } catch (err) {
    console.error("  voice: unavailable:", describeError(err));
  }
});
