import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, "Username must be alphanumeric/underscore"),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(64).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createMediaSchema = z.object({
  starId: z.string().min(1),
  type: z.enum(["IMAGE", "VIDEO", "TEXT"]),
  body: z.string().max(2000).optional(),
  mediaUrl: z.string().url().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const createReactionSchema = z.object({
  emoji: z.string().min(1).max(16),
});

export const starQuerySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateMediaInput = z.infer<typeof createMediaSchema>;
export type CreateReactionInput = z.infer<typeof createReactionSchema>;
