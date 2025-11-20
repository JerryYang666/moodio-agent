import { Sidebar } from "@/components/sidebar";
import { Navbar } from "@/components/navbar";
import { OnboardingModal } from "@/components/onboarding-modal";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex h-screen w-full overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 h-full overflow-hidden">
        <div className="md:hidden">
          <Navbar />
        </div>
        <main className="flex-1 overflow-y-auto p-5">
          <div className="container mx-auto max-w-7xl h-full">
            {children}
          </div>
        </main>
      </div>
      <OnboardingModal />
    </div>
  );
}

