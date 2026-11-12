const PAGE_SIZE = 20;

/** Slices a long list into pages so a table never renders hundreds of rows at once. */
export function usePageSlice<T>(items: T[], page: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const start = (clampedPage - 1) * PAGE_SIZE;
  return { pageItems: items.slice(start, start + PAGE_SIZE), totalPages, page: clampedPage };
}
