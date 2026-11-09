import React from "react";

export interface SubItem {
  key: string;
  path: string;
  /** Other paths (and everything below them) that also mark this item active. */
  activePaths?: string[];
  pro?: boolean;
  new?: boolean;
  target?: string;
}

export interface NavItem {
  /** Label key under `sidebar.items`. */
  key: string;
  icon: React.ReactNode;
  path?: string;
  /** Other paths (and everything below them) that also mark this item active. */
  activePaths?: string[];
  new?: boolean;
  target?: string;
  subItems?: SubItem[];
  adminOnly?: boolean;
}

export interface NavSection {
  /** Label key under `sidebar.groups`; also identifies the section. */
  key: string;
  items: NavItem[];
}

/** Which collapsible item is expanded: section key + item index. */
export interface OpenSubmenu {
  section: string;
  index: number;
}

/**
 * Whether a nav entry is the current page: an exact match on `path`, or
 * `pathname` at/below one of its `activePaths` (detail pages, sub-routes).
 */
export function isNavPathActive(
  entry: { path?: string; activePaths?: string[] },
  pathname: string,
): boolean {
  if (entry.path === pathname) return true;
  return (entry.activePaths ?? []).some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
