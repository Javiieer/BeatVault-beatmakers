import { describe, expect, it } from "vitest";
import { canonicalMarketplaceHash, marketplaceNavigationPath, getPathname, getQuery, loginHref, loginDestination, safeReturnHash } from "./routing";

describe("hash routing", () => {
  it('resumes internal discovery context without replaying payment callbacks', () => {
    const original = '#/marketplace?tab=library&search=dark%20soul&checkout=success&order=old';
    const destination = loginDestination(loginHref(original));
    expect(getQuery(destination).get('tab')).toBe('library');
    expect(getQuery(destination).get('search')).toBe('dark soul');
    expect(getQuery(destination).has('checkout')).toBe(false);
    expect(getQuery(destination).has('order')).toBe(false);
    expect(loginDestination(loginHref('#/beat-detail?id=published'))).toBe('#/beat-detail?id=published');
    expect(loginDestination(loginHref('#/store?id=creator'))).toBe('#/store?id=creator');
  });
  it('rejects external, privileged, nested and control-character return destinations', () => {
    for (const value of ['https://evil.test', '//evil.test', '#/login?returnTo=evil', '#/admin', '#/password-reset?token=secret', '#/marketplace\\evil', '#/marketplace\n']) expect(safeReturnHash(value)).toBeUndefined();
    expect(loginDestination('#/login?returnTo=https%3A%2F%2Fevil.test')).toBe('#/marketplace');
  });
  it("defaults an empty hash to the dashboard", () => {
    expect(getPathname("")).toBe("/dashboard");
    expect(getQuery("").toString()).toBe("");
  });

  it("reads normal routes", () => {
    expect(getPathname("#/library")).toBe("/library");
  });

  it("separates a route query", () => {
    expect(getPathname("#/shorts?short=clip-1")).toBe("/shorts");
    expect(getQuery("#/shorts?short=clip-1").get("short")).toBe("clip-1");
  });

  it("decodes URL encoded query values", () => {
    expect(getQuery("#/library?search=dark%20orchestra").get("search")).toBe("dark orchestra");
  });

  it("preserves unknown routes", () => {
    expect(getPathname("#/future-feature")).toBe("/future-feature");
  });

  it('merges legacy discovery and library links without losing encoded searches', () => {
    const beats = canonicalMarketplaceHash('#/beats?search=dark%20%26%20soul');
    expect(getPathname(beats)).toBe('/marketplace');
    expect(getQuery(beats).get('type')).toBe('beat');
    expect(getQuery(beats).get('search')).toBe('dark & soul');
    expect(getQuery(canonicalMarketplaceHash('#/library?section=beats')).get('tab')).toBe('library');
    expect(canonicalMarketplaceHash('#/store?id=creator')).toBe('#/store?id=creator');
    expect(canonicalMarketplaceHash('#/marketplace?checkout=success')).toBe('#/marketplace?checkout=success');
  });

  it('keeps Marketplace selected for its detail and store subpages', () => {
    expect(marketplaceNavigationPath('/beat-detail')).toBe('/marketplace');
    expect(marketplaceNavigationPath('/store')).toBe('/marketplace');
    expect(marketplaceNavigationPath('/studio')).toBe('/studio');
  });
});
