export interface PersonalizationOption {
  id: string;
  labelKey: string;
}

export interface PersonalizationQuestion {
  id: string;
  titleKey: string;
  subtitleKey: string;
  type: "single" | "multi";
  maxSelections?: number;
  options: PersonalizationOption[];
  allowCustom: boolean;
  allowSkip: boolean;
}

export const PERSONALIZATION_QUESTIONS: PersonalizationQuestion[] = [
  {
    id: "creativeGoals",
    titleKey: "personalization.q1.title",
    subtitleKey: "personalization.q1.subtitle",
    type: "multi",
    options: [
      { id: "short_film", labelKey: "personalization.q1.shortFilm" },
      { id: "feature_film", labelKey: "personalization.q1.featureFilm" },
      { id: "documentary", labelKey: "personalization.q1.documentary" },
      { id: "music_video", labelKey: "personalization.q1.musicVideo" },
      { id: "brand_commercial", labelKey: "personalization.q1.brandCommercial" },
      { id: "ugc_social_ad", labelKey: "personalization.q1.ugcSocialAd" },
      { id: "product_showcase", labelKey: "personalization.q1.productShowcase" },
      { id: "corporate_event", labelKey: "personalization.q1.corporateEvent" },
      { id: "game_pv_trailer", labelKey: "personalization.q1.gamePvTrailer" },
      { id: "animation", labelKey: "personalization.q1.animation" },
      { id: "motion_graphics", labelKey: "personalization.q1.motionGraphics" },
      { id: "vlog_lifestyle", labelKey: "personalization.q1.vlogLifestyle" },
      { id: "art_experimental", labelKey: "personalization.q1.artExperimental" },
      { id: "fan_edit_remix", labelKey: "personalization.q1.fanEditRemix" },
      { id: "just_exploring", labelKey: "personalization.q1.justExploring" },
    ],
    allowCustom: true,
    allowSkip: true,
  },
  {
    id: "userRole",
    titleKey: "personalization.q2.title",
    subtitleKey: "personalization.q2.subtitle",
    type: "single",
    options: [
      { id: "student", labelKey: "personalization.q2.student" },
      { id: "hobbyist", labelKey: "personalization.q2.hobbyist" },
      { id: "freelance", labelKey: "personalization.q2.freelance" },
      { id: "professional", labelKey: "personalization.q2.professional" },
      { id: "marketer", labelKey: "personalization.q2.marketer" },
      { id: "entrepreneur", labelKey: "personalization.q2.entrepreneur" },
      { id: "researcher", labelKey: "personalization.q2.researcher" },
    ],
    allowCustom: true,
    allowSkip: true,
  },
  {
    id: "experienceLevel",
    titleKey: "personalization.q3.title",
    subtitleKey: "personalization.q3.subtitle",
    type: "single",
    options: [
      { id: "beginner", labelKey: "personalization.q3.beginner" },
      { id: "learning", labelKey: "personalization.q3.learning" },
      { id: "intermediate", labelKey: "personalization.q3.intermediate" },
      { id: "professional", labelKey: "personalization.q3.professional" },
    ],
    allowCustom: true,
    allowSkip: true,
  },
  {
    id: "mainGoal",
    titleKey: "personalization.q4.title",
    subtitleKey: "personalization.q4.subtitle",
    type: "single",
    options: [
      { id: "get_inspired", labelKey: "personalization.q4.getInspired" },
      { id: "learn", labelKey: "personalization.q4.learn" },
      { id: "create_fast", labelKey: "personalization.q4.createFast" },
      { id: "elevate_quality", labelKey: "personalization.q4.elevateQuality" },
      { id: "just_exploring", labelKey: "personalization.q4.justExploring" },
    ],
    allowCustom: true,
    allowSkip: true,
  },
  {
    id: "communicationTone",
    titleKey: "personalization.q5.title",
    subtitleKey: "personalization.q5.subtitle",
    type: "single",
    options: [
      { id: "casual", labelKey: "personalization.q5.casual" },
      { id: "friendly", labelKey: "personalization.q5.friendly" },
      { id: "professional", labelKey: "personalization.q5.professional" },
      { id: "technical", labelKey: "personalization.q5.technical" },
    ],
    allowCustom: true,
    allowSkip: true,
  },
  {
    id: "explanationDepth",
    titleKey: "personalization.q6.title",
    subtitleKey: "personalization.q6.subtitle",
    type: "single",
    options: [
      { id: "just_do_it", labelKey: "personalization.q6.justDoIt" },
      { id: "brief", labelKey: "personalization.q6.brief" },
      { id: "moderate", labelKey: "personalization.q6.moderate" },
      { id: "deep", labelKey: "personalization.q6.deep" },
    ],
    allowCustom: true,
    allowSkip: true,
  },
];
