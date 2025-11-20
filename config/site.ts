export type SiteConfig = typeof siteConfig;

export const siteConfig = {
  name: "moodio agent",
  description: "moodio agent",
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
      expiresIn: "15m", // 15 minutes (jose format: "15m", "1h", "1d", etc.)
      cookieName: "moodio_access_token",
      maxAge: 15 * 60, // 15 minutes in seconds
    },

    // Refresh Token Configuration
    refreshToken: {
      expiresInDays: 15, // 15 days
      cookieName: "moodio_refresh_token",
      maxAge: 15 * 24 * 60 * 60, // 15 days in seconds
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
    },
  },
};
