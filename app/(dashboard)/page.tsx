"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { useAuth } from "@/hooks/use-auth";
import { Sparkles, ArrowRight } from "lucide-react";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { InspirationSection } from "@/components/dashboard/InspirationSection";

export default function Home() {
  const router = useRouter();
  const t = useTranslations();
  const { user, loading, error } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !user) {
    // If not authenticated, layout usually handles redirect, but return null just in case
    return null;
  }

  const displayName = user.firstName || user.email.split("@")[0];

  return (
    <div className="flex flex-col min-h-screen pb-12">
      {/* Elegant Top Bar */}
      <section className="relative overflow-hidden border-b border-default-100 bg-linear-to-r from-default-50 via-primary-50/30 to-default-50 dark:from-background dark:via-primary-900/10 dark:to-background mb-4">
        <div className="relative z-10 max-w-[1600px] mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-default-800">
              Moodio
            </h1>
            <span className="text-default-300">|</span>
            <p className="text-sm text-default-500 font-medium">
              All-in-one creation platform
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-default-100/50 text-xs font-medium text-default-600 border border-default-200">
              <Sparkles size={14} className="text-default-500" />
              <span>Welcome back, {displayName}</span>
            </div>
            <Button
              color="primary"
              variant="shadow"
              size="sm"
              className="font-medium rounded-full px-6"
              endContent={<ArrowRight size={16} />}
              onPress={() => router.push("/chat")}
            >
              {t("dashboard.goToAgent")}
            </Button>
          </div>
        </div>
      </section>

      {/* Main Content Layout */}
      <main className="max-w-[1600px] mx-auto w-full px-6 flex flex-col lg:flex-row gap-8">
        {/* Left Column: Recent Activity */}
        <div className="w-full lg:w-1/3 flex flex-col space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight text-default-800">Recent Activity</h2>
          </div>
          <RecentActivity />
        </div>

        {/* Right Column: Inspiration Gallery */}
        <div className="w-full lg:w-2/3 flex flex-col space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight text-default-800">Today&apos;s Inspiration</h2>
          </div>
          <InspirationSection />
        </div>
      </main>
    </div>
  );
}
