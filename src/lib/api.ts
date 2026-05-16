import Constants from "expo-constants";

// Production-safe default — Expo Go on a real device, EAS builds, and App
// Store binaries all hit the deployed backend without any extra config.
// Override locally via .env (`EXPO_PUBLIC_API_URL=http://192.168.x.x:8000`
// for a LAN-reachable host) or app.json `extra.apiUrl`. NEVER default to
// localhost — mobile devices can't reach the build host's loopback.
const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  "https://api.qualifiedcommercial.com";

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

export interface ApiOptions extends RequestInit {
  devUser?: string;
  authToken?: string;
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { devUser, authToken, headers, ...rest } = opts;
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(devUser ? { "X-Dev-User": devUser } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...headers,
    },
  });
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* ignore */ }
    throw new ApiError(res.status, `${res.status} ${res.statusText}`, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const apiBase = API_URL;
