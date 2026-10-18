export type ResourcePresence = "distributed" | "absent" | "unknown";
export type ResourceFilter = "all" | "favorites" | "distributed" | "pending";
export interface ResourceSummary {
  id: string;
  favorite?: boolean;
  tags?: readonly string[];
  search: readonly string[];
  presence: ResourcePresence;
}
export interface ResourceQuery {
  filter?: ResourceFilter;
  query?: string;
  tags?: readonly string[];
}

export function filterResources<T>(
  items: readonly T[],
  summarize: (item: T) => ResourceSummary,
  query: ResourceQuery,
): T[] {
  const needle = query.query?.trim().toLowerCase() ?? "";
  const tags = query.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [];
  return items.filter((item) => {
    const summary = summarize(item);
    if (query.filter === "favorites" && !summary.favorite) return false;
    if (query.filter === "distributed" && summary.presence !== "distributed")
      return false;
    if (query.filter === "pending" && summary.presence !== "absent")
      return false;
    if (tags.length && !summary.tags?.some((tag) => tags.includes(tag.trim())))
      return false;
    return (
      !needle ||
      summary.search.some((field) => field.toLowerCase().includes(needle))
    );
  });
}

export function countResources<T>(
  items: readonly T[],
  summarize: (item: T) => ResourceSummary,
): Record<ResourceFilter | "unknown", number> {
  const counts = {
    all: items.length,
    favorites: 0,
    distributed: 0,
    pending: 0,
    unknown: 0,
  };
  for (const item of items) {
    const summary = summarize(item);
    if (summary.favorite) counts.favorites++;
    counts[summary.presence === "absent" ? "pending" : summary.presence]++;
  }
  return counts;
}

export function resourcePageNumbers(page: number, total: number): number[] {
  const count = Math.min(5, Math.max(1, total));
  const start = Math.max(1, Math.min(page - 2, total - count + 1));
  return Array.from({ length: count }, (_, index) => start + index);
}

export function paginateResources<T>(
  items: readonly T[],
  page: number,
  size: number,
): {
  items: T[];
  currentPage: number;
  totalPages: number;
  pageNumbers: number[];
} {
  const pageSize = Number.isSafeInteger(size) && size > 0 ? size : 10;
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Number.isSafeInteger(page)
    ? Math.min(totalPages, Math.max(1, page))
    : 1;
  return {
    items: items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    currentPage,
    totalPages,
    pageNumbers: resourcePageNumbers(currentPage, totalPages),
  };
}
