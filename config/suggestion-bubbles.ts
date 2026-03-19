import type {
  SuggestionBubble,
  SuggestionBubbleFactory,
} from "@/components/chat/suggestion-bubble-types";

// ─── Empty chat suggestions ───────────────────────────────────────────────────
// Shown before the user sends their first message.
// None of these auto-send — prompt text ends with a trailing space so the user
// can continue typing.

export const EMPTY_CHAT_SUGGESTIONS: SuggestionBubble[] = [
  {
    id: "empty-film-cinematic",
    label: "Generate cinematic film",
    icon: "Film",
    contexts: ["empty-chat"],
    action: {
      promptText: "A cinematic scene where",
      menuState: { mode: "agent", expertise: "film" },
    },
  },
  {
    id: "empty-ugc-ad",
    label: "Create a UGC ad",
    icon: "Megaphone",
    contexts: ["empty-chat"],
    action: {
      promptText: "Create a UGC ad for",
      menuState: { mode: "agent", expertise: "ugcAd" },
    },
  },
  {
    id: "empty-game-interactive",
    label: "Design a game concept",
    icon: "Gamepad2",
    contexts: ["empty-chat"],
    action: {
      promptText: "Make a game trailer showing",
      menuState: { mode: "agent", expertise: "game" },
    },
  },
  {
    id: "empty-music-video",
    label: "Create a music video",
    icon: "Music",
    contexts: ["empty-chat"],
    action: {
      promptText: "Make a music video where",
      menuState: { mode: "agent", expertise: "musicVideo" },
    },
  },
  {
    id: "empty-short-drama",
    label: "Ideate a short drama",
    icon: "Clapperboard",
    contexts: ["empty-chat"],
    action: {
      promptText: "Create a story when",
      menuState: { mode: "agent", expertise: "shortDrama" },
    },
  },
  {
    id: "empty-animation",
    label: "Create an animation",
    icon: "Sparkles",
    contexts: ["empty-chat"],
    action: {
      promptText: "An animated scene where",
      menuState: { mode: "agent", expertise: "animation" },
    },
  },
];

// ─── Browse video actions ─────────────────────────────────────────────────────
// Factory functions for the video detail page on the browse tab.
// Each takes runtime video data and returns a fully resolved SuggestionBubble.

export const BROWSE_VIDEO_ACTIONS: Record<string, SuggestionBubbleFactory> = {
  learn: ({ contentId, videoUrl }) => ({
    id: `browse-learn-${contentId}`,
    label: "Learn from this video",
    icon: "GraduationCap",
    contexts: ["browse-video"],
    action: {
      promptText:
        "Explain what filming techniques are used in this video and break down the key creative decisions.",
      menuState: { expertise: "film" },
      pendingVideos: [
        {
          videoId: String(contentId),
          url: videoUrl,
          source: "retrieval",
        },
      ],
    },
  }),

  explore: ({ contentId, videoUrl }) => ({
    id: `browse-explore-${contentId}`,
    label: "Explore related videos",
    icon: "Search",
    contexts: ["browse-video"],
    action: {
      promptText:
        "Analyze this video first, then find similar or related videos using the search tool.",
      menuState: { expertise: "film" },
      pendingVideos: [
        {
          videoId: String(contentId),
          url: videoUrl,
          source: "retrieval",
        },
      ],
    },
  }),

  create: ({ contentId, videoUrl }) => ({
    id: `browse-create-${contentId}`,
    label: "Create a video like this",
    icon: "Wand2",
    contexts: ["browse-video"],
    action: {
      promptText:
        "Analyze this video and help me create a similar one with the same style and techniques using the video tool.",
      menuState: { expertise: "film" },
      pendingVideos: [
        {
          videoId: String(contentId),
          url: videoUrl,
          source: "retrieval",
        },
      ],
    },
  }),
};
