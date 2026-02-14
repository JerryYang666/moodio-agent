export type SiteConfig = typeof siteConfig;

export const siteConfig = {
  name: "moodio agent",
  description: "moodio agent",
  chatInputPrefix: "moodio_chat_draft_",
  // Active chat tracking for cross-page continuity
  activeChatId: "moodio_active_chat_id",
  // Chat side panel collapse state (defaults to expanded)
  chatPanelCollapsed: "moodio_chat_panel_collapsed",
  // Chat side panel width (for resizable panel)
  chatPanelWidth: "moodio_chat_panel_width",
  navItems: [
    {
      label: "Home",
      href: "/",
    },
  ],
  navMenuItems: [
    {
      label: "Home",
      href: "/",
    },
  ],
  links: {
    github: "https://github.com/moodio-ai",
  },

  // Authentication Configuration
  auth: {
    // JWT Access Token Configuration
    accessToken: {
      expiresIn: "30m", // 30 minutes (jose format: "30m", "1h", "1d", etc.)
      cookieName: "moodio_access_token",
      maxAge: 30 * 60, // 30 minutes in seconds
    },
    // Allow small clock skew on backend verification
    clockSkewSeconds: 60,

    // Refresh Token Configuration
    refreshToken: {
      expiresInDays: 20, // 20 days
      gracePeriodSeconds: 3600, // 1 hour grace period for old tokens
      cookieName: "moodio_refresh_token",
      maxAge: 20 * 24 * 60 * 60, // 20 days in seconds
    },

    // OTP Configuration
    otp: {
      length: 6, // 6-digit numeric code
      expiresInMinutes: 10, // 10 minutes
    },

    // Cookie Configuration
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      // In production set AUTH_COOKIE_DOMAIN=.moodio.art to scope cookies across subdomains
      ...(process.env.AUTH_COOKIE_DOMAIN
        ? { domain: process.env.AUTH_COOKIE_DOMAIN }
        : {}),
    },
  },
  
  // Annotation Platform
  annotationPlatformUrl:
    process.env.NEXT_PUBLIC_ANNOTATION_PLATFORM_URL ||
    "https://admin.moodio.art/admin/browse-shots-admin",

  // Audio Recording Configuration
  audioRecording: {
    maxDuration: 120, // 2 minutes in seconds
    countdownThreshold: 15, // Show countdown 15 seconds before max duration
  },

  // CloudFront Configuration
  cloudfront: {
    signedUrlExpirationSeconds: 30 * 60, // 30 minutes default expiration for legacy signed URLs
    signedCookieExpirationSeconds: 30 * 60, // 30 minutes default expiration for signed cookies
    signedCookieClockSkewSeconds: 60, // Allow CloudFront policy to outlive cookie by 60s
    cookieDomain: process.env.CLOUDFRONT_COOKIE_DOMAIN,
  },

  // PWA Configuration
  pwa: {
    enableInstallPrompt: false, // Set to true when icons are ready in /public/icons/
  },

  // Upload Configuration
  upload: {
    maxFileSizeMB: 15, // Maximum file size in MB for image uploads
    allowedImageTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
    presignedUrlExpiresIn: 300, // 5 minutes in seconds
  },
};
