// The look plan, in one place. Six values and one accent hue, plus one colour per
// team so a bot's side reads at a glance; the lighting makes every shade the game
// needs, so no other colour appears in the code. The same names are the CSS custom
// properties in index.html.
export const PALETTE = {
  canvas: "#33363d",
  surface: "#54595f",
  hairline: "#7d838d",
  ink: "#e9e6df",
  muted: "#98a0a8",
  accent: "#f0a830",
  ember: "#e0603a",
  warden: "#3fa8c8",
};

export function tone(name) {
  return PALETTE[name];
}
