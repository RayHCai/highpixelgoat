import type { Style, Terrain } from "../spec/schema";
import type { PostOptions } from "./post";

/**
 * Colour and layout decisions live here so the three styles read as one
 * system and a setting looks like itself in every style.
 */

export interface TerrainPalette {
  sky: string;
  fog: string;
  water: string;
  deepWater: string;
  sand: string;
  /** Field/ground variants; terrain picks between them by patch id. */
  ground: string[];
  forest: string;
  rock: string;
  snow: string;
  /** Height at which ground gives way to rock, in cells. */
  rockLine: number;
  /** Height at which rock gives way to snow, in cells. */
  snowLine: number;
  /** Sea level in cells (columns at/below are water). */
  seaLevel: number;
  /** Overall relief multiplier. */
  relief: number;
  /** Fraction of land that is water-ish at noise level 0.5 (bias). */
  waterBias: number;
}

const base: TerrainPalette = {
  sky: "#cfe3ef",
  fog: "#d8e6ec",
  water: "#3f8fd2",
  deepWater: "#2b6cb3",
  sand: "#e3d49a",
  ground: ["#7fa64d", "#9bb85b", "#6f9a44", "#b8b35f", "#88a85a", "#a3a84e", "#5f8f3f"],
  forest: "#3f6b32",
  rock: "#8f8a80",
  snow: "#f1f3f5",
  rockLine: 9,
  snowLine: 14,
  seaLevel: 1.0,
  relief: 1,
  waterBias: 0,
};

/** Lawns and verges for the built-up settings. */
const lawn = ["#7fae52", "#8bb85a", "#76a64c", "#93bd63"];

const suburb: TerrainPalette = {
  ...base,
  sky: "#cfe3f2",
  fog: "#dbe7ee",
  ground: lawn,
  forest: "#4f7f3a",
  rock: "#8f8a80",
  relief: 0.12,
  waterBias: -0.5,
  rockLine: 99,
  snowLine: 99,
};

export const TERRAIN_PALETTES: Record<Terrain, TerrainPalette> = {
  bedroom: suburb,
  livingroom: suburb,
  kitchen: suburb,
  office: { ...suburb, sky: "#d6dde8", fog: "#d9e0ea" },
  street: suburb,
  park: { ...suburb, ground: ["#78ad4f", "#86b85a", "#6ea348", "#8fc064"], relief: 0.25, waterBias: -0.3 },
  city: {
    ...base,
    sky: "#d7dde6",
    fog: "#d3d9e2",
    ground: ["#a9a9a4", "#b3b1ab", "#a19f9a", "#bdbab3"],
    forest: "#6f8f5a",
    rock: "#6c6e73",
    snow: "#e8e8e8",
    relief: 0.1,
    waterBias: -0.5,
    rockLine: 99,
    snowLine: 99,
  },
  plains: { ...base, relief: 0.55, waterBias: -0.08 },
  mountains: {
    ...base,
    relief: 2.2,
    rockLine: 7,
    snowLine: 12,
    ground: ["#6f9a44", "#7fa64d", "#88a85a", "#5f8f3f"],
    fog: "#cfd9e3",
  },
  island: { ...base, relief: 1.1, waterBias: 0.35, sand: "#efe1a6", water: "#39a9d8", deepWater: "#2170b8" },
  desert: {
    ...base,
    sky: "#f1dcc0",
    fog: "#efd9bd",
    water: "#4aa3c9",
    deepWater: "#2f7fb0",
    sand: "#e9c98a",
    ground: ["#e2bd7f", "#d9ae6e", "#e8c88e", "#cfa262", "#f0d39b"],
    forest: "#a8894a",
    rock: "#b58a5e",
    snow: "#f3e7d2",
    rockLine: 6,
    snowLine: 99,
    relief: 0.8,
    waterBias: -0.3,
  },
  snow: {
    ...base,
    sky: "#dfe8f0",
    fog: "#e6edf3",
    water: "#6fa6d6",
    deepWater: "#4b7fb5",
    sand: "#dfe4ea",
    ground: ["#eef2f5", "#e4eaef", "#f4f6f8", "#d9e0e6"],
    forest: "#4c6b5a",
    rock: "#9aa3ab",
    snow: "#ffffff",
    rockLine: 7,
    snowLine: 9,
    relief: 1.3,
  },
  ocean: { ...base, relief: 0.9, waterBias: 0.6, fog: "#cfe0ea" },
};

/** How a setting is laid out on top of the height field. */
export type Layout = "nature" | "suburb" | "city" | "park";

export interface Setting {
  layout: Layout;
  /** A cut-away room at the origin (the house the subject starts in). */
  room: "bedroom" | "livingroom" | "kitchen" | "office" | null;
  /** The origin sits on a road rather than on a lot. */
  onStreet: boolean;
  /** Camera orbit: start angle and sweep speed, radians. Rooms keep the open walls facing the camera. */
  azimuth: number;
  azimuthRate: number;
  /** Fog density multiplier; built-up places stay clearer so their props read from the first frame. */
  fog: number;
}

const landscape: Setting = {
  layout: "nature",
  room: null,
  onStreet: false,
  azimuth: -0.55,
  azimuthRate: 0.035,
  fog: 1,
};
const roomSetting = (room: Setting["room"], layout: Layout = "suburb"): Setting => ({
  layout,
  room,
  onStreet: false,
  azimuth: -0.62,
  azimuthRate: 0.011,
  fog: 0.55,
});

export const SETTINGS: Record<Terrain, Setting> = {
  bedroom: roomSetting("bedroom"),
  livingroom: roomSetting("livingroom"),
  kitchen: roomSetting("kitchen"),
  office: roomSetting("office", "city"),
  street: { layout: "suburb", room: null, onStreet: true, azimuth: -0.5, azimuthRate: 0.022, fog: 0.6 },
  city: { layout: "city", room: null, onStreet: false, azimuth: -0.5, azimuthRate: 0.025, fog: 0.4 },
  park: { layout: "park", room: null, onStreet: false, azimuth: -0.55, azimuthRate: 0.03, fog: 0.75 },
  plains: landscape,
  mountains: landscape,
  island: landscape,
  desert: landscape,
  snow: landscape,
  ocean: landscape,
};

export interface StyleLook {
  /** Post-processing setup, or null to render straight to the canvas. */
  post: PostOptions | null;
  /** Saturation multiplier applied to terrain colours. */
  saturation: number;
  /** Fog density multiplier. */
  fog: number;
  /** Paper tint mixed into the sky for the drawing style. */
  paper: string | null;
}

export const STYLE_LOOKS: Record<Style, StyleLook> = {
  // Half-resolution render upscaled with nearest filtering: chunky pixels.
  pixels: {
    post: { scale: 0.5, nearest: true, outline: 0, inkColor: "#000000" },
    saturation: 1.0,
    fog: 1.0,
    paper: null,
  },
  // Direct multisampled render.
  lowpoly: { post: null, saturation: 1.05, fog: 1.1, paper: null },
  // Supersampled render with ink outlines on depth edges.
  drawing: {
    post: { scale: 1.5, nearest: false, outline: 0.85, inkColor: "#2a1f18" },
    saturation: 0.75,
    fog: 0.8,
    paper: "#f4ecdc",
  },
};
