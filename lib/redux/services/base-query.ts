import { fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from "@reduxjs/toolkit/query/react";

/**
 * Base query with automatic token refresh on 401 errors
 * 
 * When an API call returns 401 (Unauthorized):
 * 1. Attempts to refresh the access token via /api/auth/refresh
 * 2. Retries the original request with the new token
 * 3. If refresh fails, redirects to login page
 * 
 * This ensures users stay logged in during API calls, not just page navigation
 */
export const createBaseQueryWithReauth = (baseUrl: string): BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> => {
  const baseQuery = fetchBaseQuery({ 
    baseUrl,
    credentials: "include", // Send cookies (JWT tokens)
  });

  return async (args, api, extraOptions) => {
    // Execute the original query
    let result = await baseQuery(args, api, extraOptions);

    // If we get a 401 Unauthorized error, try to refresh the token
    if (result.error && result.error.status === 401) {
      console.log("API call returned 401, attempting token refresh...");

      // Attempt to refresh the access token
      const refreshResult = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });

      if (refreshResult.ok) {
        console.log("Token refreshed successfully, retrying original request");
        
        // Token refresh succeeded, retry the original request
        result = await baseQuery(args, api, extraOptions);
      } else {
        console.log("Token refresh failed, redirecting to login");
        
        // Token refresh failed, redirect to login
        // Clear tokens and redirect
        if (typeof window !== "undefined") {
          window.location.href = "/auth/login";
        }
      }
    }

    return result;
  };
};
