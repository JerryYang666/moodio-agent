"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Check if running in standalone mode (already installed)
function isInStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  
  return (
    ("standalone" in window.navigator && (window.navigator as any).standalone) ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

// Check if device is iOS
function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
}

// Check if browser is Safari (not Chrome/Firefox on iOS)
function isIOSSafari(): boolean {
  if (typeof window === "undefined") return false;
  
  const userAgent = window.navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(userAgent);
  const isSafari = /safari/.test(userAgent) && !/crios|fxios|opios/.test(userAgent);
  
  return isIos && isSafari;
}

const PROMPT_DISMISSED_KEY = "moodio_ios_install_prompt_dismissed";
const PROMPT_DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

export function IOSInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Don't show if not iOS Safari or already in standalone mode
    if (!isIOSSafari() || isInStandaloneMode()) {
      return;
    }

    // Check if user has dismissed the prompt recently
    const dismissedAt = localStorage.getItem(PROMPT_DISMISSED_KEY);
    if (dismissedAt) {
      const dismissedTime = parseInt(dismissedAt, 10);
      if (Date.now() - dismissedTime < PROMPT_DISMISS_DURATION) {
        return;
      }
    }

    // Show prompt after a short delay
    const timer = setTimeout(() => {
      setShowPrompt(true);
      // Trigger animation after mount
      requestAnimationFrame(() => setIsVisible(true));
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem(PROMPT_DISMISSED_KEY, Date.now().toString());
    setTimeout(() => setShowPrompt(false), 300);
  };

  const handleInstallLater = () => {
    handleDismiss();
  };

  if (!showPrompt) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            onClick={handleDismiss}
          />
          
          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[101] bg-zinc-900 rounded-t-3xl p-6 pb-10 safe-area-bottom"
          >
            {/* Handle bar */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 bg-zinc-600 rounded-full" />
            
            {/* Content */}
            <div className="mt-4 text-center">
              {/* App Icon */}
              <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center mb-4 shadow-lg shadow-violet-500/30">
                <svg 
                  className="w-9 h-9 text-white" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" 
                  />
                </svg>
              </div>
              
              <h2 className="text-xl font-semibold text-white mb-2">
                Install Moodio Agent
              </h2>
              <p className="text-zinc-400 text-sm mb-6 max-w-xs mx-auto">
                Add to your home screen for a full-screen experience and quick access
              </p>

              {/* Instructions */}
              <div className="bg-zinc-800/50 rounded-2xl p-4 mb-6 text-left">
                <div className="flex items-start gap-3 mb-4">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <span className="text-blue-400 text-sm font-medium">1</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-white text-sm">
                      Tap the{" "}
                      <span className="inline-flex items-center align-middle">
                        <ShareIcon className="w-5 h-5 text-blue-400" />
                      </span>{" "}
                      <span className="text-blue-400 font-medium">Share</span> button below
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <span className="text-blue-400 text-sm font-medium">2</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-white text-sm">
                      Scroll and tap{" "}
                      <span className="inline-flex items-center align-middle">
                        <AddToHomeIcon className="w-5 h-5 text-zinc-300" />
                      </span>{" "}
                      <span className="text-white font-medium">"Add to Home Screen"</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Buttons */}
              <button
                onClick={handleInstallLater}
                className="w-full py-3 px-4 rounded-xl bg-zinc-800 text-zinc-300 font-medium text-sm hover:bg-zinc-700 transition-colors"
              >
                Maybe Later
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// iOS Share Icon
function ShareIcon({ className }: { className?: string }) {
  return (
    <svg 
      className={className} 
      viewBox="0 0 24 24" 
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12M12 3l4 4M12 3L8 7" />
      <path d="M5 10v9a2 2 0 002 2h10a2 2 0 002-2v-9" />
    </svg>
  );
}

// Add to Home Screen Icon (Plus in square)
function AddToHomeIcon({ className }: { className?: string }) {
  return (
    <svg 
      className={className} 
      viewBox="0 0 24 24" 
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

// Hook to check if app is installed (for use elsewhere)
export function useIsAppInstalled() {
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    setIsInstalled(isInStandaloneMode());
  }, []);

  return isInstalled;
}

// Hook to check if on iOS
export function useIsIOS() {
  const [isIOSDevice, setIsIOSDevice] = useState(false);

  useEffect(() => {
    setIsIOSDevice(isIOS());
  }, []);

  return isIOSDevice;
}

