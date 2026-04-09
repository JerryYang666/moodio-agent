import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shared Content - Moodio",
  description: "View shared creative assets on Moodio",
  referrer: "no-referrer",
  other: {
    "X-Frame-Options": "DENY",
  },
};

export default function ShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
