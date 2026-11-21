export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = PAGE_SIZES[0];
export const PAGE_SIZE_STORAGE_KEY = "lendloop-page-size";

export type PageSize = (typeof PAGE_SIZES)[number];
export const FIRST_PAGE = { pageSize: DEFAULT_PAGE_SIZE, cursor: null };

export function parsePageSize(value: string | null) {
  return PAGE_SIZES.find((size) => String(size) === value) ?? DEFAULT_PAGE_SIZE;
}
