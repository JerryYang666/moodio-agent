export interface VideoDetailAction {
  label: string;
  icon: "learn" | "explore" | "create";
}

export interface VideoDetailTopic {
  label: string;
}

export interface VideoDetailData {
  title: string;
  source: string;
  actions: VideoDetailAction[];
  topics: VideoDetailTopic[];
}

export const MOCK_VIDEO_DETAIL: VideoDetailData = {
  title: "Reward Yourself 1054",
  source: "aarp",
  actions: [
    { label: "Learn from this video", icon: "learn" },
    { label: "Explore related videos", icon: "explore" },
    { label: "Create a video like this", icon: "create" },
  ],
  topics: [
    { label: "Subject & Appearance" },
    { label: "Cinematic Techniques" },
    { label: "Scene & Setting" },
    { label: "Movement & Action" },
    { label: "Shot Framing" },
  ],
};
