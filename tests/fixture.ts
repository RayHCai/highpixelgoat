import { parseSpec, type ScenarioSpec } from "../src/starter/spec/schema";

/** A hand-timed scenario in the renderer shape: eight beats over 36 seconds. */
export function exampleSpec(): ScenarioSpec {
  const scales = [1, 2, 8, 32, 1024, 16384, 1048576, 16777216];
  const ats = [0, 4, 8, 12, 17, 22, 27, 32];
  return parseSpec({
    id: "cheeks-double-every-hour",
    title: "Your cheeks double in size every hour",
    style: "pixels",
    format: { width: 1080, height: 1920, fps: 30, duration: 36 },
    world: { terrain: "bedroom", seed: 7 },
    subject: { label: "YOU", shape: "blob", texture: "checker", colors: ["#6b4a2e", "#8f6a45"], baseSize: 0.6 },
    rule: "CHEEKS DOUBLE EVERY HOUR",
    beats: scales.map((subjectScale, i) => ({
      at: ats[i],
      heading: `Hour ${i * 3}`,
      stats: [`${subjectScale} TIMES`],
      narration: `Beat number ${i + 1} of the example, read aloud by the narrator.`,
      subjectScale,
      effects: i === 4 ? ["debris", "shake"] : i === 6 ? ["debris", "flash", "shake"] : [],
    })),
  });
}
