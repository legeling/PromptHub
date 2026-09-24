import { z } from "zod";

export const directFolderSchema = z.object({
  id: z.string().trim().min(1),
  ownerUserId: z.string().nullable().optional(),
  visibility: z.enum(["private", "shared"]).optional(),
  name: z
    .string()
    .trim()
    .min(1, "name is required")
    .max(200, "name is too long"),
  icon: z.string().trim().min(1).max(50).nullable().optional(),
  parentId: z.string().trim().min(1).nullable().optional(),
  order: z.number().int().nonnegative(),
  isPrivate: z.boolean().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
