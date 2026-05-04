import { getDesktopPermission } from "@/lib/desktop/permissions";
import {
  getTablePermission,
  getEditableGrants,
} from "@/lib/production-table/permissions";

export type RealtimePermission = "owner" | "editor" | "viewer";

// Keep in sync with the Go relay (realtime/protocol.go).
const ALLOWED_NAMESPACES = new Set(["desktop", "production-table"]);
const TOPIC_ID_REGEX = /^[A-Za-z0-9_-]{1,128}$/;

export type AuthorizeResult =
  | { permission: RealtimePermission }
  | { error: "not_found" | "forbidden" | "bad_request" };

/**
 * Parse "<namespace>:<id>". Returns null on anything that fails validation.
 */
export function parseTopic(
  topic: string
): { namespace: string; id: string } | null {
  if (typeof topic !== "string") return null;
  const trimmed = topic.trim();
  const colon = trimmed.indexOf(":");
  if (colon <= 0 || colon === trimmed.length - 1) return null;
  const namespace = trimmed.slice(0, colon);
  const id = trimmed.slice(colon + 1);
  if (!ALLOWED_NAMESPACES.has(namespace)) return null;
  if (!TOPIC_ID_REGEX.test(id)) return null;
  return { namespace, id };
}

/**
 * Dispatch a topic-authorize request to the appropriate namespace-specific
 * permission helper. Called by both the /api/realtime/authorize route (used
 * by the Go relay) and the legacy per-resource permission routes.
 */
export async function authorizeTopic(
  topic: string,
  userId: string
): Promise<AuthorizeResult> {
  const parsed = parseTopic(topic);
  if (!parsed) return { error: "bad_request" };

  if (parsed.namespace === "desktop") {
    const permission = await getDesktopPermission(parsed.id, userId);
    if (!permission) return { error: "forbidden" };
    return { permission: permission as RealtimePermission };
  }

  if (parsed.namespace === "production-table") {
    const permission = await getTablePermission(parsed.id, userId);
    if (!permission) return { error: "forbidden" };
    if (permission === "viewer") {
      const grants = await getEditableGrants(parsed.id, userId);
      if (grants.columnIds.length > 0 || grants.rowIds.length > 0) {
        return { permission: "editor" };
      }
    }
    return { permission: permission as RealtimePermission };
  }

  return { error: "bad_request" };
}
