export const scopedKey = (key: string, scope?: string) => scope ? `${key}:${encodeURIComponent(scope)}` : key;
