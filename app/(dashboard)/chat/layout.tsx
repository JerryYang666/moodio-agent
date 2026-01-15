import { Sidebar } from "@/components/sidebar";
import AssetsHoverSidebar from "@/components/chat/assets-hover-sidebar";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar />
      <div className="flex-1 h-full w-full overflow-hidden relative bg-background px-4 md:px-5 py-0 chat-with-assets">
        {children}
        <AssetsHoverSidebar />
      </div>
    </div>
  );
}
