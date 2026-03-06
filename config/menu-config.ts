import { DEFAULT_LLM_MODEL } from "@/lib/llm/types";

export const MENU_CONFIG = {
  version: "1.0",
  categories: {
    mode: {
      label: "Mode",
      default: "agent",
      options: {
        agent: {
          label: "Agent",
          description: "AI-assisted image generation with prompt help",
          icon: "BotMessageSquare",
        },
        image: {
          label: "Image",
          description: "Direct image generation from your prompt",
          icon: "ImageIcon",
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
    imageSize: {
      label: "Image Size",
      default: "2k",
      options: {
        "2k": { label: "2k" },
        "4k": { label: "4k" },
      },
    },
    imageQuantity: {
      label: "Image Quantity",
      default: "smart",
      options: {
        smart: {
          label: "Smart",
          description:
            "Let the agent decide the best number of images to generate",
          icon: "Sparkles",
        },
        "1": { label: "1" },
        "2": { label: "2" },
        "3": { label: "3" },
        "4": { label: "4" },
      },
    },
  },

  contexts: {
    agent: {
      defaults: {
        model: "nano-banana-pro",
        expertise: "commercial",
        aspectRatio: "smart",
        imageSize: "2k",
        imageQuantity: "smart",
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
        imageSize: {
          enabled: true,
          allowed: ["2k", "4k"],
        },
        imageQuantity: {
          enabled: true,
          allowed: ["smart", "1", "2", "3", "4"],
        },
      },
    },

    image: {
      defaults: {
        model: "nano-banana-pro",
        aspectRatio: "smart",
        imageSize: "2k",
        imageQuantity: "1",
      },
      availability: {
        model: { enabled: true, allowed: ["nano-banana-pro", "seedream-45"] },
        expertise: {
          enabled: false,
          reason: "Expertise is not available in direct image generation mode.",
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
        imageSize: {
          enabled: true,
          allowed: ["2k", "4k"],
        },
        imageQuantity: {
          enabled: true,
          allowed: ["1", "2", "3", "4"],
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
