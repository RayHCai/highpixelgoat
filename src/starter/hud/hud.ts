import type { ScenarioSpec, Word } from "../spec/schema";
import type { TimelineState } from "../spec/timing";
import { clamp01, easeOutCubic, estimateNarrationSeconds } from "../spec/timing";
import type { ScreenPoint } from "../scene/world";

/**
 * DOM text overlay in the reference layout: big serif heading top-left, bold
 * uppercase stat lines, a red rule pill, the narration as an italic subtitle
 * mid-frame that lights up word by word with the voice, and a leader-line
 * callout on the subject. Every animation is a function of the seconds since
 * the active beat, so seeking is exact.
 */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent: HTMLElement,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}

/** Fade + slide in over `dur` seconds starting at `delay`. */
function enter(node: HTMLElement, since: number, delay: number, dur: number, dy = 18): void {
  const p = easeOutCubic(clamp01((since - delay) / dur));
  node.style.opacity = String(p);
  node.style.transform = `translateY(${(1 - p) * dy}px)`;
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * Match the written words of a line to a voice provider's word list, which
 * usually drops punctuation and sometimes splits or merges tokens. Greedy and
 * sequential: a written word matches one provider word, or a run of them
 * whose letters concatenate to it; unmatched words come back null.
 */
export function alignWords(tokens: string[], words: Word[]): (Word | null)[] {
  const out: (Word | null)[] = new Array<Word | null>(tokens.length).fill(null);
  let j = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = normalise(tokens[i]!);
    if (!t) continue;
    let matched = false;
    for (let skip = 0; skip <= 2 && j + skip < words.length && !matched; skip++) {
      let acc = "";
      let k = j + skip;
      while (k < words.length && acc.length < t.length) {
        acc += normalise(words[k]!.text);
        k++;
        if (acc === t) {
          out[i] = { text: tokens[i]!, start: words[j + skip]!.start, end: words[k - 1]!.end };
          j = k;
          matched = true;
          break;
        }
        if (!t.startsWith(acc)) break;
      }
    }
  }
  return out;
}

/**
 * Word timings for a beat. The on-screen text is always the written line, so
 * punctuation and capitalisation survive; the timings come from the voice
 * provider where its words can be matched, and are spread evenly between
 * matched neighbours (or over the whole line) elsewhere.
 */
export function subtitleWords(narration: string, words: Word[] | undefined, seconds: number | undefined): Word[] {
  const tokens = narration.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const total = words && words.length ? words[words.length - 1]!.end : (seconds ?? estimateNarrationSeconds(narration));
  const aligned = words && words.length ? alignWords(tokens, words) : tokens.map(() => null);
  const result: Word[] = new Array<Word>(tokens.length);
  let i = 0;
  while (i < tokens.length) {
    const hit = aligned[i];
    if (hit) {
      result[i] = hit;
      i++;
      continue;
    }
    // A run of unmatched words: spread them between the surrounding anchors.
    let end = i;
    while (end < tokens.length && !aligned[end]) end++;
    const from = i > 0 ? result[i - 1]!.end : 0;
    const to = end < tokens.length ? aligned[end]!.start : total;
    const per = Math.max(0, to - from) / (end - i);
    for (let k = i; k < end; k++) {
      result[k] = { text: tokens[k]!, start: from + (k - i) * per, end: from + (k - i + 1) * per };
    }
    i = end;
  }
  return result;
}

export class Hud {
  private readonly root: HTMLElement;
  private readonly heading: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly rule: HTMLElement;
  private readonly caption: HTMLElement;
  private readonly callout: HTMLElement;
  private readonly calloutLabel: HTMLElement;
  private readonly calloutLine: SVGSVGElement;
  private readonly calloutPath: SVGPathElement;
  private readonly flash: HTMLElement;
  private readonly spec: ScenarioSpec;
  private readonly labelled: boolean;
  private renderedBeat = -2;
  private words: { node: HTMLElement; start: number }[] = [];

  constructor(spec: ScenarioSpec, stage: HTMLElement) {
    this.spec = spec;
    this.root = el("div", "hud", stage);
    const block = el("div", "hud-block", this.root);
    this.heading = el("div", "hud-heading", block);
    this.stats = el("div", "hud-stats", block);
    this.rule = el("div", "hud-rule", block);
    this.caption = el("div", "hud-caption", this.root);
    this.callout = el("div", "hud-callout", this.root);
    this.calloutLine = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.calloutLine.setAttribute("class", "hud-callout-line");
    this.calloutLine.setAttribute("width", String(spec.format.width));
    this.calloutLine.setAttribute("height", String(spec.format.height));
    this.calloutPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    this.calloutLine.appendChild(this.calloutPath);
    this.root.appendChild(this.calloutLine);
    this.calloutLabel = el("div", "hud-callout-label", this.callout);
    this.calloutLabel.textContent = spec.subject.label;
    // No label, no callout: the subject is just the thing the camera stays with.
    this.labelled = spec.subject.label.trim().length > 0;
    this.flash = el("div", "hud-flash", this.root);
    if (spec.rule) this.rule.textContent = spec.rule;
    else this.rule.style.display = "none";
  }

  update(state: TimelineState, anchor: ScreenPoint): void {
    const { beat, since } = state;

    if (state.beatIndex !== this.renderedBeat) {
      this.renderedBeat = state.beatIndex;
      this.heading.textContent = beat?.heading ?? "";
      this.stats.replaceChildren(
        ...(beat?.stats ?? []).map((s) => {
          const line = document.createElement("div");
          line.className = "hud-stat";
          line.textContent = s;
          return line;
        }),
      );
      const words = beat ? subtitleWords(beat.narration, beat.words, beat.narrationSeconds) : [];
      this.words = words.map((w) => {
        const node = document.createElement("span");
        node.className = "hud-word";
        node.textContent = w.text;
        return { node, start: w.start };
      });
      this.caption.replaceChildren(
        ...this.words.flatMap((w, i) => (i ? [document.createTextNode(" "), w.node] : [w.node])),
      );
    }

    if (!beat) {
      this.root.style.opacity = "0";
      return;
    }
    this.root.style.opacity = "1";

    enter(this.heading, since, 0, 0.3, 26);
    Array.from(this.stats.children).forEach((node, i) => enter(node as HTMLElement, since, 0.06 + i * 0.07, 0.3, 12));
    // The rule pill persists; it only animates in on the first beat.
    if (state.beatIndex === 0) enter(this.rule, since, 0.35, 0.4, 10);
    else {
      this.rule.style.opacity = "1";
      this.rule.style.transform = "none";
    }

    if (this.words.length) {
      enter(this.caption, since, 0, 0.25, 16);
      // A word lights up the moment the voice reaches it. A small lead keeps
      // the highlight from reading as late.
      for (const w of this.words) w.node.classList.toggle("on", since + 0.05 >= w.start);
    } else {
      this.caption.style.opacity = "0";
    }

    // Callout: label up and to the right of the subject's top, with a bracket
    // line back to it. Hidden while the subject is off screen.
    const { width, height } = this.spec.format;
    const onScreen =
      this.labelled && anchor.visible && anchor.x > -50 && anchor.x < width + 50 && anchor.y > 0 && anchor.y < height;
    const calloutIn = state.beatIndex === 0 ? easeOutCubic(clamp01((since - 0.6) / 0.5)) : 1;
    this.callout.style.opacity = onScreen ? String(calloutIn) : "0";
    this.calloutLine.style.opacity = onScreen ? String(calloutIn) : "0";
    if (onScreen) {
      const lx = anchor.x + 70;
      const ly = anchor.y - 44;
      this.callout.style.transform = `translate(${lx}px, ${ly - 16}px)`;
      this.calloutPath.setAttribute("d", `M ${anchor.x} ${anchor.y} L ${anchor.x} ${ly} L ${lx - 12} ${ly}`);
    }

    const flash = state.effects.find((e) => e.name === "flash");
    this.flash.style.opacity = flash ? String(Math.max(0, 1 - flash.age / 0.35) * 0.9) : "0";
  }
}

/** Stylesheet for the overlay; injected once by the player. */
export const HUD_CSS = `
.hud { position: absolute; inset: 0; pointer-events: none; color: #fff; font-family: "Inter", "Segoe UI", system-ui, sans-serif; }
.hud-block { position: absolute; left: 64px; top: 300px; max-width: 900px; }
.hud-heading { font-family: "Playfair Display", "Georgia", serif; font-size: 118px; line-height: 1; font-weight: 500; letter-spacing: -0.5px; text-shadow: 0 3px 18px rgba(0,0,0,.45), 0 1px 2px rgba(0,0,0,.35); will-change: transform, opacity; }
.hud-stats { margin-top: 20px; }
.hud-stat { font-size: 30px; font-weight: 800; letter-spacing: 2.5px; text-transform: uppercase; line-height: 1.35; text-shadow: 0 2px 10px rgba(0,0,0,.45); }
.hud-rule { display: inline-block; margin-top: 18px; padding: 8px 22px; border-radius: 999px; background: #d9342b; color: #fff; font-size: 25px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; box-shadow: 0 4px 18px rgba(0,0,0,.25); }
.hud-caption { position: absolute; left: 72px; right: 72px; top: 690px; font-family: "Playfair Display", "Georgia", serif; font-style: italic; font-size: 46px; line-height: 1.28; font-weight: 400; text-wrap: balance; text-shadow: 0 3px 18px rgba(0,0,0,.5), 0 1px 2px rgba(0,0,0,.35); will-change: transform, opacity; }
.hud-word { color: rgba(255,255,255,.38); transition: color .12s ease-out; }
.hud-word.on { color: #fff; }
.hud-callout { position: absolute; left: 0; top: 0; }
.hud-callout-label { font-size: 24px; font-weight: 800; letter-spacing: 4px; text-transform: uppercase; text-shadow: 0 2px 10px rgba(0,0,0,.5); }
.hud-callout-line { position: absolute; left: 0; top: 0; fill: none; stroke: #fff; stroke-width: 3px; stroke-linejoin: round; filter: drop-shadow(0 2px 6px rgba(0,0,0,.45)); }
.hud-flash { position: absolute; inset: 0; background: #fff; opacity: 0; }
`;
