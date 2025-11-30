import { Sidebar } from "@/components/sidebar";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar />
      <div className="flex-1 h-full w-full overflow-hidden relative bg-background p-4 md:p-5">
        {children}
      </div>
    </div>
  );
}
