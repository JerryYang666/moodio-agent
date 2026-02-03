/**
 * API client wrapper with automatic token refresh
 * Handles 401 errors by attempting to refresh the access token
 */

interface ApiClientOptions extends RequestInit {
  skipRefresh?: boolean;
}

/**
 * API client that automatically handles token refresh on 401 errors
 */
export async function apiClient<T = any>(
  url: string,
  options: ApiClientOptions = {}
): Promise<T> {
  const { skipRefresh = false, ...fetchOptions } = options;

  // Make the initial request
  let response = await fetch(url, fetchOptions);

  // If we get a 401 and haven't tried refreshing yet, attempt to refresh
  if (response.status === 401 && !skipRefresh) {
    // Try to refresh the access token
    const refreshResponse = await fetch("/api/auth/refresh", {
      method: "POST",
    });

    if (refreshResponse.ok) {
      // Refresh succeeded, retry the original request
      response = await fetch(url, fetchOptions);
    } else {
      // Refresh failed, redirect to login
      if (typeof window !== "undefined") {
        window.location.href = "/auth/login";
      }
      throw new Error("Authentication failed");
    }
  }

  // Parse response
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || `HTTP ${response.status}: ${response.statusText}`
    );
  }

  return data;
}

/**
 * Convenience methods for common HTTP verbs
 */
export const api = {
  get: <T = any>(url: string, options?: ApiClientOptions) =>
    apiClient<T>(url, { ...options, method: "GET" }),

  post: <T = any>(url: string, body?: any, options?: ApiClientOptions) =>
    apiClient<T>(url, {
      ...options,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T = any>(url: string, body?: any, options?: ApiClientOptions) =>
    apiClient<T>(url, {
      ...options,
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T = any>(url: string, body?: any, options?: ApiClientOptions) =>
    apiClient<T>(url, {
      ...options,
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T = any>(url: string, body?: any, options?: ApiClientOptions) =>
    apiClient<T>(url, {
      ...options,
      method: "DELETE",
      headers: body
        ? {
            "Content-Type": "application/json",
            ...options?.headers,
          }
        : options?.headers,
      body: body ? JSON.stringify(body) : undefined,
    }),
};
