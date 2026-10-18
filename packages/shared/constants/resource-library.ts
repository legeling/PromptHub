/** Superset of existing choices: upgrading never resets a valid saved preference. */
export const RESOURCE_PAGE_SIZES = [10, 12, 24, 25, 48, 50, 100] as const;
export const RESOURCE_GALLERY_COLUMNS = [
  "auto",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
] as const;
export type ResourceGalleryColumns = (typeof RESOURCE_GALLERY_COLUMNS)[number];

export function isResourceGalleryColumns(
  value: unknown,
): value is ResourceGalleryColumns {
  return RESOURCE_GALLERY_COLUMNS.some((column) => column === value);
}
