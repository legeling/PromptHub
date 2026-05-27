import type { SyncSnapshot } from "@prompthub/shared/types/sync";

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS?: Fetcher;
  JWT_SECRET: string;
  ALLOW_REGISTRATION?: string;
  ACCESS_TOKEN_TTL_SECONDS?: string;
}

export interface AuthUser {
  userId: string;
  username: string;
  role: "admin" | "user";
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
  user: {
    id: string;
    username: string;
    role: "admin" | "user";
  };
}

export type StoredSyncSnapshot = SyncSnapshot & {
  settings?: NonNullable<SyncSnapshot["settings"]>;
};
