import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Preview Browse - Moodio",
  description: "Preview and browse creative assets on Moodio",
};

export default function PreviewBrowseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
