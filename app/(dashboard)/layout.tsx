import { PrimarySidebar } from "@/components/primary-sidebar";
import { Navbar } from "@/components/navbar";
import { OnboardingModal } from "@/components/onboarding-modal";
import { TestKit } from "@/components/test-kit";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex h-screen w-full overflow-hidden">
      <PrimarySidebar />
      <div className="flex flex-col flex-1 h-full overflow-hidden">
        <div className="md:hidden">
          <Navbar />
        </div>
        <main className="flex-1 overflow-y-auto md:p-0 p-0 bg-default-50/50">
          {/* Removed container and padding to allow full width/height for children layouts */}
          {children}
        </main>
      </div>
      <OnboardingModal />
      <TestKit />
    </div>
  );
}
