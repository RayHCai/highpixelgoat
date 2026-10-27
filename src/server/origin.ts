/**
 * Who may call the server. It spends the Claude account it runs with, and a
 * browser will deliver any web page's requests to it: a cross-site form post
 * needs no CORS preflight, and a DNS-rebinding page arrives under its own host
 * name. So while the server listens on loopback the Host must be a loopback
 * name, and a request that changes anything must come from the dashboard's
 * own origin.
 */

const LOOPBACK_NAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function hostnameOf(host: string): string | null {
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return null;
  }
}

/** True for an interface (HOST) or host name that only this machine can reach. */
export function isLoopback(host: string): boolean {
  // HOST may be a bare IPv6 address ("::1"); a Host header brackets it ("[::1]:5173").
  const bareIpv6 = !host.startsWith("[") && host.split(":").length > 2;
  const name = hostnameOf(bareIpv6 ? `[${host}]` : host);
  return name !== null && (LOOPBACK_NAMES.has(name) || /^127\./.test(name));
}

export interface RequestHeaders {
  method: string;
  host: string | undefined;
  origin: string | undefined;
}

/** Why a request is refused, or null to let it through. */
export function requestRefusal(r: RequestHeaders, o: { loopbackOnly: boolean }): string | null {
  if (!r.host) return "the request has no Host header";
  if (o.loopbackOnly && !isLoopback(r.host)) return `this server only answers on localhost, not ${r.host}`;
  if (r.origin === undefined || SAFE_METHODS.has(r.method)) return null;
  let originHost: string | null = null;
  try {
    originHost = new URL(r.origin).host;
  } catch {
    // An opaque origin ("null") is never the dashboard.
  }
  return originHost === r.host ? null : `requests from ${r.origin} are refused`;
}
