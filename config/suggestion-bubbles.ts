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
    id: "empty-create-picture",
    label: "Create a picture",
    icon: "ImagePlus",
    contexts: ["empty-chat"],
    action: {
      promptText: "Create a picture of ",
      menuState: { mode: "agent" },
    },
  },
  {
    id: "empty-ideate-short-film",
    label: "Ideate a short film",
    icon: "Clapperboard",
    contexts: ["empty-chat"],
    action: {
      promptText: "Help me ideate a short film about ",
      menuState: { mode: "agent" },
    },
  },
  {
    id: "empty-design-game-concept",
    label: "Design a game concept",
    icon: "Gamepad2",
    contexts: ["empty-chat"],
    action: {
      promptText: "Help me design a game concept for ",
      menuState: { mode: "agent", expertise: "game" },
    },
  },
  {
    id: "empty-create-product-mockup",
    label: "Create a product mockup",
    icon: "Package",
    contexts: ["empty-chat"],
    action: {
      promptText: "Create a product mockup for ",
      menuState: { mode: "agent", expertise: "product" },
    },
  },
  {
    id: "empty-design-ui",
    label: "Design a UI screen",
    icon: "Layout",
    contexts: ["empty-chat"],
    action: {
      promptText: "Design a UI screen for ",
      menuState: { mode: "agent", expertise: "uiux" },
    },
  },
  {
    id: "empty-generate-film-stills",
    label: "Generate film stills",
    icon: "Film",
    contexts: ["empty-chat"],
    action: {
      promptText: "Generate cinematic film stills of ",
      menuState: { mode: "agent", expertise: "film" },
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
