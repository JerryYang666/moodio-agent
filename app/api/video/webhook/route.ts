/**
 * POST /api/video/webhook
 *
 * Legacy webhook endpoint. Kept for backward compatibility with in-flight
 * fal requests that were submitted before the provider-specific webhook
 * routes were introduced. Delegates to the fal webhook handler.
 *
 * New generations use /api/video/webhook/fal or /api/video/webhook/kie.
 */
export { POST } from "./fal/route";
