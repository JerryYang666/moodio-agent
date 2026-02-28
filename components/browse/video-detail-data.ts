export interface VideoDetailMetadata {
  mediaType: string;
  genre: string;
  aspectRatio: string;
  creativeEntities: string;
  creatorDirector: string;
  campaign: string;
  cameraMovement: string;
  videoPlaybackSpeed: string;
  shotSize: string;
  shotType: string;
  cameraFocus: string;
  cameraAngle: string;
  cameraHeight: string;
  lightingSetup: string;
  subjectLighting: string;
}

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
  metadata: VideoDetailMetadata;
  actions: VideoDetailAction[];
  topics: VideoDetailTopic[];
}

export const MOCK_VIDEO_DETAIL: VideoDetailData = {
  title: "Reward Yourself 1054",
  source: "aarp",
  metadata: {
    mediaType: "Advertisement",
    genre: "Food commercial",
    aspectRatio: "16:9",
    creativeEntities: "Placeholder",
    creatorDirector: "Placeholder",
    campaign: "Placeholder",
    cameraMovement: "Zoom In, Dolly In",
    videoPlaybackSpeed: "Regular",
    shotSize: "Medium Close-Up, Close-up",
    shotType: "Human Shot",
    cameraFocus: "Shallow Focus",
    cameraAngle: "Level Angle, Eye",
    cameraHeight: "At Subject, Eye Level",
    lightingSetup: "Interior, Day Time, Daylight, Soft Li...",
    subjectLighting: "Right Light, Normal/Low Contrast",
  },
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
