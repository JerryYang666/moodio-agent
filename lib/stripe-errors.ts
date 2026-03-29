import Stripe from "stripe";
import { NextResponse } from "next/server";

/**
 * Stable error codes returned to the client for i18n lookup.
 * The frontend maps these via the "stripeErrors" translation namespace.
 */
export const STRIPE_ERROR_CODES = [
  "card_declined",
  "card_expired",
  "card_incorrect_cvc",
  "card_incorrect_number",
  "card_insufficient_funds",
  "card_processing_error",
  "card_generic",
  "invalid_request",
  "authentication_error",
  "rate_limit",
  "connection_error",
  "idempotency_error",
  "api_error",
  "unknown",
] as const;

export type StripeErrorCode = (typeof STRIPE_ERROR_CODES)[number];

interface StripeErrorResponse {
  error: string;
  code: StripeErrorCode;
  status: number;
}

const DECLINE_CODE_MAP: Record<string, StripeErrorCode> = {
  insufficient_funds: "card_insufficient_funds",
  card_not_supported: "card_declined",
  currency_not_supported: "card_declined",
  do_not_honor: "card_declined",
  do_not_try_again: "card_declined",
  fraudulent: "card_declined",
  generic_decline: "card_declined",
  incorrect_number: "card_incorrect_number",
  incorrect_cvc: "card_incorrect_cvc",
  invalid_cvc: "card_incorrect_cvc",
  invalid_expiry_month: "card_expired",
  invalid_expiry_year: "card_expired",
  expired_card: "card_expired",
  processing_error: "card_processing_error",
  lost_card: "card_declined",
  stolen_card: "card_declined",
  pickup_card: "card_declined",
  restricted_card: "card_declined",
  withdrawal_count_limit_exceeded: "card_declined",
  card_velocity_exceeded: "card_declined",
  live_mode_test_card: "card_declined",
  testmode_decline: "card_declined",
  approve_with_id: "card_declined",
  call_issuer: "card_declined",
  issuer_not_available: "card_processing_error",
  new_account_information_available: "card_declined",
  no_action_taken: "card_declined",
  not_permitted: "card_declined",
  reenter_transaction: "card_processing_error",
  service_not_allowed: "card_declined",
  transaction_not_allowed: "card_declined",
  try_again_later: "card_processing_error",
};

function classifyCardError(err: Stripe.errors.StripeCardError): StripeErrorCode {
  if (err.decline_code && DECLINE_CODE_MAP[err.decline_code]) {
    return DECLINE_CODE_MAP[err.decline_code];
  }

  switch (err.code) {
    case "incorrect_number":
    case "invalid_number":
      return "card_incorrect_number";
    case "incorrect_cvc":
    case "invalid_cvc":
      return "card_incorrect_cvc";
    case "expired_card":
    case "invalid_expiry_month":
    case "invalid_expiry_year":
      return "card_expired";
    case "card_declined":
      return "card_declined";
    case "processing_error":
      return "card_processing_error";
    default:
      return "card_generic";
  }
}

function classifyStripeError(err: Stripe.errors.StripeError): StripeErrorResponse {
  switch (err.type) {
    case "StripeCardError":
      return {
        error: err.message,
        code: classifyCardError(err as Stripe.errors.StripeCardError),
        status: 402,
      };

    case "StripeInvalidRequestError":
      return {
        error: "Invalid request",
        code: "invalid_request",
        status: 400,
      };

    case "StripeAuthenticationError":
      return {
        error: "Payment service configuration error",
        code: "authentication_error",
        status: 500,
      };

    case "StripeRateLimitError":
    case "RateLimitError":
      return {
        error: "Too many requests",
        code: "rate_limit",
        status: 429,
      };

    case "StripeConnectionError":
      return {
        error: "Payment service unavailable",
        code: "connection_error",
        status: 503,
      };

    case "StripeIdempotencyError":
      return {
        error: "Duplicate request",
        code: "idempotency_error",
        status: 409,
      };

    case "StripeAPIError":
    default:
      return {
        error: "Payment service error",
        code: "api_error",
        status: 502,
      };
  }
}

/**
 * Unified Stripe error handler for all API routes.
 *
 * - Classifies Stripe errors by type and maps to a stable `code`
 * - Logs the full raw error server-side
 * - Returns a sanitized JSON response with { error, code } for i18n on the client
 * - Non-Stripe errors are treated as generic 500s
 */
export function handleStripeError(
  err: unknown,
  context: string
): NextResponse {
  if (err instanceof Stripe.errors.StripeError) {
    console.error(`[${context}] Stripe ${err.type}:`, {
      message: err.message,
      code: err.code,
      decline_code: (err as any).decline_code,
      param: err.param,
      statusCode: err.statusCode,
      requestId: err.requestId,
    });

    const classified = classifyStripeError(err);

    return NextResponse.json(
      { error: classified.error, code: classified.code },
      { status: classified.status }
    );
  }

  const message = err instanceof Error ? err.message : String(err);
  console.error(`[${context}] Unexpected error:`, err);

  return NextResponse.json(
    { error: message, code: "unknown" as StripeErrorCode },
    { status: 500 }
  );
}
