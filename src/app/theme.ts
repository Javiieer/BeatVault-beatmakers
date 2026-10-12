export const themeStorageKey = "beatvault:theme";
export const defaultTheme = "dark" as const;

export type Theme = "dark" | "light" | "custom";
export type CustomThemeColors = { background: string; card: string; button: string; link: string };

export const defaultCustomTheme: CustomThemeColors = {
  background: "#101318",
  card: "#1b222b",
  button: "#4bd8c2",
  link: "#76b9ff",
};

export const isTheme = (value: unknown): value is Theme =>
  value === "dark" || value === "light" || value === "custom";

export const parseTheme = (value: unknown): Theme => {
  if (isTheme(value)) return value;
  if (value === "ivory") return "light";
  return defaultTheme;
};

export const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[\da-f]{6}$/i.test(value);

export const parseCustomTheme = (value: unknown): CustomThemeColors => {
  if (!value || typeof value !== "object") return defaultCustomTheme;
  const input = value as Partial<CustomThemeColors>;
  return {
    background: isHexColor(input.background) ? input.background : defaultCustomTheme.background,
    card: isHexColor(input.card) ? input.card : defaultCustomTheme.card,
    button: isHexColor(input.button) ? input.button : defaultCustomTheme.button,
    link: isHexColor(input.link) ? input.link : defaultCustomTheme.link,
  };
};

export const toRgb = (hex: string): string => {
  const color = isHexColor(hex) ? hex.slice(1) : defaultCustomTheme.button.slice(1);
  const channels = [0, 2, 4].map(index => Number.parseInt(color.slice(index, index + 2), 16));
  return `rgb(${channels.join(" ")})`;
};

const channels = (hex: string) => [0, 2, 4].map(index => Number.parseInt(hex.slice(index + 1, index + 3), 16) / 255);
const luminance = (hex: string) => channels(hex).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);

const harmonizeSurface = (hex: string, referenceHue?: number) => {
  const [red, green, blue] = channels(hex);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  let hue = 0;
  if (delta > 0) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  hue = (hue + 360) % 360;
  if (referenceHue !== undefined) {
    const difference = ((hue - referenceHue + 540) % 360) - 180;
    if (Math.abs(difference) > 42) hue = (referenceHue + Math.sign(difference) * 42 + 360) % 360;
  }
  const saturation = Math.min(delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1)), 0.18);
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const section = hue / 60;
  const secondary = chroma * (1 - Math.abs(section % 2 - 1));
  const match = lightness - chroma / 2;
  const rgb = section < 1 ? [chroma, secondary, 0] : section < 2 ? [secondary, chroma, 0]
    : section < 3 ? [0, chroma, secondary] : section < 4 ? [0, secondary, chroma]
      : section < 5 ? [secondary, 0, chroma] : [chroma, 0, secondary];
  return `#${rgb.map(value => Math.round((value + match) * 255).toString(16).padStart(2, "0")).join("")}`;
};

const hueOf = (hex: string) => {
  const [red, green, blue] = channels(hex);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  if (delta === 0) return 0;
  const hue = maximum === red ? 60 * (((green - blue) / delta) % 6)
    : maximum === green ? 60 * ((blue - red) / delta + 2) : 60 * ((red - green) / delta + 4);
  return (hue + 360) % 360;
};

export const contrastRatio = (first: string, second: string): number => {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};

const blend = (from: string, to: string, amount: number) => {
  const start = channels(from);
  const end = channels(to);
  const hex = start.map((value, index) => Math.round((value + (end[index] - value) * amount) * 255).toString(16).padStart(2, "0")).join("");
  return `#${hex}`;
};

export const readableText = (background: string, minimum = 4.8): string => {
  const endpoint = contrastRatio("#000000", background) >= contrastRatio("#ffffff", background) ? "#000000" : "#ffffff";
  if (contrastRatio(endpoint, background) < minimum) return endpoint;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 12; step++) {
    const middle = (low + high) / 2;
    if (contrastRatio(blend(endpoint, background, middle), background) >= minimum) low = middle;
    else high = middle;
  }
  return blend(endpoint, background, low);
};

export const readableAccent = (color: string, backgrounds: string[], minimum = 4.8): string => {
  if (backgrounds.every(background => contrastRatio(color, background) >= minimum)) return color;
  const candidates = ["#000000", "#ffffff"].map(endpoint => {
    for (let step = 1; step <= 100; step++) {
      const adjusted = blend(color, endpoint, step / 100);
      if (backgrounds.every(background => contrastRatio(adjusted, background) >= minimum)) return { color: adjusted, amount: step };
    }
    return undefined;
  }).filter((candidate): candidate is { color: string; amount: number } => Boolean(candidate));
  return candidates.sort((a, b) => a.amount - b.amount)[0]?.color
    ?? (contrastRatio("#000000", backgrounds[0]) > contrastRatio("#ffffff", backgrounds[0]) ? "#000000" : "#ffffff");
};

export const customThemeStyle = (input: CustomThemeColors): Record<string, string> => {
  const colors = parseCustomTheme(input);
  const background = harmonizeSurface(colors.background);
  const card = harmonizeSurface(colors.card, hueOf(background));
  const surfaceText = readableText(card);
  const buttonText = readableText(colors.button);
  const link = readableAccent(colors.link, [background]);
  const surfaceLink = readableAccent(colors.link, [card]);
  const semantic = {
    success: "#16834b",
    warning: "#9b5b00",
    error: "#b42345",
    info: "#176889",
    violet: "#6750b5",
  };
  return {
    colorScheme: luminance(background) > 0.45 ? "light" : "dark",
    "--bg": toRgb(background),
    "--bg-elevated": toRgb(card),
    "--surface": toRgb(card),
    "--surface-elevated": toRgb(card),
    "--surface-hover": `color-mix(in srgb, ${toRgb(card)} 88%, ${surfaceText})`,
    "--border": `color-mix(in srgb, ${toRgb(card)} 78%, ${surfaceText})`,
    "--border-strong": `color-mix(in srgb, ${toRgb(card)} 62%, ${surfaceText})`,
    "--primary": toRgb(colors.button),
    "--primary-hover": `color-mix(in srgb, ${toRgb(colors.button)} 86%, ${buttonText})`,
    "--primary-soft": `color-mix(in srgb, ${toRgb(colors.button)} 20%, ${toRgb(background)})`,
    "--link": link,
    "--surface-link": surfaceLink,
    "--secondary": link,
    "--accent": link,
    "--accent-soft": `color-mix(in srgb, ${link} 18%, ${toRgb(background)})`,
    "--surface-accent-soft": `color-mix(in srgb, ${surfaceLink} 18%, ${toRgb(card)})`,
    "--success": readableAccent(semantic.success, [background]),
    "--surface-success": readableAccent(semantic.success, [card]),
    "--warning": readableAccent(semantic.warning, [background]),
    "--surface-warning": readableAccent(semantic.warning, [card]),
    "--amber": readableAccent(semantic.warning, [background]),
    "--surface-amber": readableAccent(semantic.warning, [card]),
    "--error": readableAccent(semantic.error, [background]),
    "--surface-error": readableAccent(semantic.error, [card]),
    "--danger": readableAccent(semantic.error, [background]),
    "--surface-danger": readableAccent(semantic.error, [card]),
    "--info": readableAccent(semantic.info, [background]),
    "--surface-info": readableAccent(semantic.info, [card]),
    "--violet": readableAccent(semantic.violet, [background]),
    "--surface-violet": readableAccent(semantic.violet, [card]),
    "--text": readableText(background),
    "--text-secondary": readableText(background),
    "--text-muted": readableText(background),
    "--muted": readableText(background),
    "--surface-text": surfaceText,
    "--surface-text-secondary": surfaceText,
    "--surface-text-muted": surfaceText,
    "--on-primary": buttonText,
  };
};

export const readStoredTheme = (storage: Storage | undefined): Theme => {
  try {
    return parseTheme(storage?.getItem(themeStorageKey));
  } catch {
    return defaultTheme;
  }
};
