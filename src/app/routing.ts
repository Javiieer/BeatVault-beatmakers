export type ParsedHash = {
  pathname: string;
  query: URLSearchParams;
};

export function parseHash(hash: string): ParsedHash {
  const withoutPrefix = hash.startsWith("#") ? hash.slice(1) : hash;
  const separator = withoutPrefix.indexOf("?");
  const pathname = separator === -1 ? withoutPrefix : withoutPrefix.slice(0, separator);
  const queryString = separator === -1 ? "" : withoutPrefix.slice(separator + 1);

  return {
    pathname: pathname || "/dashboard",
    query: new URLSearchParams(queryString),
  };
}

export function getPathname(hash: string): string {
  return parseHash(hash).pathname;
}

export function getQuery(hash: string): URLSearchParams {
  return parseHash(hash).query;
}

export function canonicalMarketplaceHash(hash: string): string {
  const { pathname, query } = parseHash(hash);
  if (pathname !== '/beats' && pathname !== '/library' && !(pathname === '/store' && !query.get('id'))) return hash;
  if (pathname === '/beats') {
    query.set('tab', 'explore');
    query.set('type', 'beat');
  } else if (pathname === '/library') query.set('tab', 'library');
  else query.set('tab', 'explore');
  return `#/marketplace?${query}`;
}

export function marketplaceNavigationPath(path: string): string {
  return ['/beats', '/library', '/store', '/beat-detail'].includes(path) ? '/marketplace' : path;
}

const returnQueries: Record<string, readonly string[]> = {
  '/marketplace': ['tab', 'search', 'q', 'type', 'tag'], '/beat-detail': ['id'],
  '/store': ['id', 'search', 'type', 'tag'], '/profile': ['id'], '/home': ['post'],
  '/studio': ['search'], '/upload': [], '/friends': [], '/chat': ['peer'], '/settings': [], '/plans': [],
};
const containsControl = (value: string) => [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);

/** Only product routes can be resumed; authentication/payment callback parameters are not replayed. */
export function safeReturnHash(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048 || !/^#?\/[a-z-]+(?:\?|$)/.test(value) || value.includes('\\') || containsControl(value)) return undefined;
  const hash = canonicalMarketplaceHash(value.startsWith('#') ? value : `#${value}`);
  const { pathname, query } = parseHash(hash);
  const keys = returnQueries[pathname];
  if (!keys) return undefined;
  const clean = new URLSearchParams();
  for (const key of keys) {
    const item = query.get(key);
    if (item !== null && item.length <= 255 && !containsControl(item)) clean.set(key, item);
  }
  return `#${pathname}${clean.size ? `?${clean}` : ''}`;
}

export function loginHref(returnHash = window.location.hash): string {
  return `#/login?returnTo=${encodeURIComponent(safeReturnHash(returnHash) || '#/marketplace')}`;
}

export function loginDestination(loginHash: string): string {
  return safeReturnHash(getQuery(loginHash).get('returnTo')) || '#/marketplace';
}
