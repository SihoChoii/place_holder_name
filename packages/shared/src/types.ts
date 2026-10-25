export type UserPublic = {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
};

export type Star = {
  id: string;
  catalogId: string | null;
  name: string;
  raHours: number;
  decDegrees: number;
  magnitude: number | null;
  constellation: string | null;
};

export type Media = {
  id: string;
  starId: string;
  authorId: string;
  type: "IMAGE" | "VIDEO" | "TEXT";
  body: string | null;
  mediaUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  author?: UserPublic;
  reactionCount?: number;
};

export type AuthResponse = {
  token: string;
  user: UserPublic;
};

export type ApiError = {
  error: string;
  details?: unknown;
};
