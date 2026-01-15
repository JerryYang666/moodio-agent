export const MENU_CONFIG = {
  version: "1.0",
  categories: {
    mode: {
      label: "Mode",
      default: "create",
      options: {
        create: {
          label: "Create new image",
          description: "Full generation workflow",
          icon: "WandSparkles",
        },
        edit: {
          label: "Edit selected images",
          description: "Edit existing images",
          icon: "Pencil",
        },
        chat: {
          label: "Chat",
          description: "Conversational interaction",
          icon: "MessageSquare",
        },
      },
    },

    model: {
      label: "Model",
      default: "nano-banana-pro",
      options: {
        "nano-banana-pro": { label: "Nano-banana Pro" },
        "seedream-45": { label: "Seedream 4.5" },
        midjourney: { label: "Midjourney" },
        "gpt-5.2": { label: "gpt-5.2" },
        "gemini-3": { label: "gemini-3" },
      },
    },

    expertise: {
      label: "Expertise",
      default: "commercial",
      options: {
        commercial: { label: "Commercial" },
        film: { label: "Film" },
        game: { label: "Game" },
        uiux: { label: "UI/UX" },
        product: { label: "Product" },
      },
    },

    aspectRatio: {
      label: "Aspect Ratio",
      default: "smart",
      options: {
        smart: {
          label: "Smart",
          description:
            "Let the model choose the best aspect ratio for your content",
          icon: "Sparkles",
        },
        "21:9": { label: "21:9" },
        "16:9": { label: "16:9" },
        "3:2": { label: "3:2" },
        "4:3": { label: "4:3" },
        "1:1": { label: "1:1" },
        "3:4": { label: "3:4" },
        "2:3": { label: "2:3" },
        "9:16": { label: "9:16" },
      },
    },
  },

  contexts: {
    create: {
      defaults: {
        model: "nano-banana-pro",
        expertise: "commercial",
        aspectRatio: "smart",
      },
      availability: {
        model: {
          enabled: true,
          allowed: ["nano-banana-pro", "seedream-45"],
        },
        expertise: {
          enabled: true,
          allowed: ["commercial", "film", "game", "uiux", "product"],
        },
        aspectRatio: {
          enabled: true,
          allowed: [
            "smart",
            "21:9",
            "16:9",
            "3:2",
            "4:3",
            "1:1",
            "3:4",
            "2:3",
            "9:16",
          ],
        },
      },
    },

    edit: {
      defaults: {
        model: "nano-banana-pro",
        aspectRatio: "smart",
      },
      availability: {
        model: { enabled: true, allowed: ["nano-banana-pro", "seedream-45"] },
        expertise: {
          enabled: false,
          reason: "Expertise is not available in Edit selected images mode.",
        },
        aspectRatio: {
          enabled: true,
          allowed: [
            "smart",
            "21:9",
            "16:9",
            "3:2",
            "4:3",
            "1:1",
            "3:4",
            "2:3",
            "9:16",
          ],
        },
      },
    },

    chat: {
      defaults: {
        model: "gpt-5.2",
        expertise: "commercial",
      },
      availability: {
        model: { enabled: true, allowed: ["gpt-5.2", "gemini-3"] },
        expertise: {
          enabled: true,
          allowed: ["commercial", "product", "uiux"],
        },
        aspectRatio: {
          enabled: false,
          reason: "Aspect ratio is not applicable in Chat mode.",
        },
      },
    },
  },

  uiRules: {
    modeDrivesContext: true,
    onInvalidSelection: {
      strategy: "fallback_to_context_default",
      keepUserChoiceIfStillAllowed: true,
    },
  },
} as const;

export type MenuConfig = typeof MENU_CONFIG;
