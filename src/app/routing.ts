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
