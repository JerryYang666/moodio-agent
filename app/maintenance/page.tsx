"use client";

export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
      <div className="text-center max-w-lg">
        {/* Animated gear icon */}
        <div className="mb-8">
          <svg
            className="w-24 h-24 mx-auto text-amber-400 animate-spin"
            style={{ animationDuration: "3s" }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </div>

        <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">
          Under Maintenance
        </h1>

        <p className="text-slate-300 text-lg mb-8 leading-relaxed">
          We&apos;re currently performing scheduled maintenance to improve your
          experience. Please check back in a little while.
        </p>

        <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
          <span className="inline-block w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
          <span>Working on it...</span>
        </div>
      </div>
    </div>
  );
}

