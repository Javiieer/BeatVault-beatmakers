export const themeStorageKey = "beatvault:theme";
export const defaultTheme = "classic" as const;

export type Theme = "classic" | "ember" | "ivory" | "verdant";

export const isTheme = (value: unknown): value is Theme =>
  value === "classic" || value === "ember" || value === "ivory" || value === "verdant";

export const parseTheme = (value: unknown): Theme =>
  isTheme(value) ? value : defaultTheme;

export const readStoredTheme = (storage: Storage | undefined): Theme => {
  try {
    return parseTheme(storage?.getItem(themeStorageKey));
  } catch {
    return defaultTheme;
  }
};
