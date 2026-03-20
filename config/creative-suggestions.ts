const CDN_BASE = "https://cdn0.moodio.art/images";

export interface CreativeSuggestion {
  id: string;
  title: string;
  promptText: string;
  imageId?: string;
  imageUrl?: string;
}

export const CREATIVE_SUGGESTIONS: Partial<Record<string, CreativeSuggestion[]>> = {
  film: [
    {
      id: "film-cherry-blossom",
      title: "Cherry blossom encounter",
      promptText: "Cherry blossom encounter",
      imageId: "424ba619-4959-42e4-bce2-ac52b51d1e1b",
      imageUrl: `${CDN_BASE}/424ba619-4959-42e4-bce2-ac52b51d1e1b`,
    },
    {
      id: "film-abandoned-house",
      title: "Abandoned house threshold",
      promptText: "Abandoned house threshold",
      imageId: "61bcfb4a-98f6-40aa-9bb5-9c096992106f",
      imageUrl: `${CDN_BASE}/61bcfb4a-98f6-40aa-9bb5-9c096992106f`,
    },
    {
      id: "film-cavalry-charge",
      title: "Cavalry charge at dawn",
      promptText: "Cavalry charge at dawn",
      imageId: "ef8c21e9-8ec2-4ff3-a386-04b7378cbaea",
      imageUrl: `${CDN_BASE}/ef8c21e9-8ec2-4ff3-a386-04b7378cbaea`,
    },
    {
      id: "film-underwater-awakening",
      title: "Underwater awakening",
      promptText: "Underwater awakening",
      imageId: "0cee3184-9e98-4d54-935e-9a5034c455ec",
      imageUrl: `${CDN_BASE}/0cee3184-9e98-4d54-935e-9a5034c455ec`,
    },
    {
      id: "film-interrogation-room",
      title: "Interrogation room stillness",
      promptText: "Interrogation room stillness",
      imageId: "992c9b59-e4c2-4ad8-a2df-c7153b1e7988",
      imageUrl: `${CDN_BASE}/992c9b59-e4c2-4ad8-a2df-c7153b1e7988`,
    },
    {
      id: "film-childhood-summer",
      title: "Childhood summer flashback",
      promptText: "Childhood summer flashback",
      imageId: "45a42953-5c70-45bb-97e8-e1dfa6e9e3e1",
      imageUrl: `${CDN_BASE}/45a42953-5c70-45bb-97e8-e1dfa6e9e3e1`,
    },
    {
      id: "film-car-pursuit",
      title: "Rain-soaked car pursuit",
      promptText: "Rain-soaked car pursuit",
      imageId: "3779e580-6445-49d2-9100-07c860e35959",
      imageUrl: `${CDN_BASE}/3779e580-6445-49d2-9100-07c860e35959`,
    },
    {
      id: "film-blade-duel",
      title: "Blade duel in rain",
      promptText: "Blade duel in rain",
      imageId: "b6a0fbec-2f95-4b91-bb93-eb7197f28fa8",
      imageUrl: `${CDN_BASE}/b6a0fbec-2f95-4b91-bb93-eb7197f28fa8`,
    },
    {
      id: "film-spotlight-performer",
      title: "Spotlight performer",
      promptText: "Spotlight performer",
      imageId: "dcf9b96c-2040-445e-85c3-5eb7bf55d1d5",
      imageUrl: `${CDN_BASE}/dcf9b96c-2040-445e-85c3-5eb7bf55d1d5`,
    },
    {
      id: "film-summit-first-light",
      title: "Summit at first light",
      promptText: "Summit at first light",
      imageId: "89ced25d-52a6-41f3-850a-f4d63f7bef9e",
      imageUrl: `${CDN_BASE}/89ced25d-52a6-41f3-850a-f4d63f7bef9e`,
    },
    {
      id: "film-rooftop-confession",
      title: "Midnight rooftop confession",
      promptText: "Midnight rooftop confession",
      imageId: "97a19246-8a9a-42c5-9282-8b1d7c221450",
      imageUrl: `${CDN_BASE}/97a19246-8a9a-42c5-9282-8b1d7c221450`,
    },
    {
      id: "film-train-window",
      title: "Train window passage of time",
      promptText: "Train window passage of time",
      imageId: "362855e8-0dff-47e4-b5fa-c07fb4e60363",
      imageUrl: `${CDN_BASE}/362855e8-0dff-47e4-b5fa-c07fb4e60363`,
    },
    {
      id: "film-noir-chase",
      title: "Rain-soaked noir chase",
      promptText: "Rain-soaked noir chase",
      imageId: "6defa153-aca1-4fab-8b41-dfe77c1fc5df",
      imageUrl: `${CDN_BASE}/6defa153-aca1-4fab-8b41-dfe77c1fc5df`,
    },
    {
      id: "film-desert-standoff",
      title: "Desert standoff at golden hour",
      promptText: "Desert standoff at golden hour",
      imageId: "867caee4-d90d-4950-b12d-160ade40bb72",
      imageUrl: `${CDN_BASE}/867caee4-d90d-4950-b12d-160ade40bb72`,
    },
    {
      id: "film-space-station",
      title: "Space station reveal",
      promptText: "Space station reveal",
      imageId: "4c5dd9a5-e059-4660-95ff-99cd330c8906",
      imageUrl: `${CDN_BASE}/4c5dd9a5-e059-4660-95ff-99cd330c8906`,
    },
  ],

  ugcAd: [
    {
      id: "ugc-pet-food-taste-test",
      title: "Pet food taste test",
      promptText: "Pet food taste test",
    },
    {
      id: "ugc-skincare-morning-routine",
      title: "Skincare morning routine",
      promptText: "Skincare morning routine",
    },
    {
      id: "ugc-tech-gadget-unboxing",
      title: "Tech gadget unboxing",
      promptText: "Tech gadget unboxing",
    },
    {
      id: "ugc-fitness-supplement",
      title: "Fitness supplement before/after",
      promptText: "Fitness supplement before/after",
    },
    {
      id: "ugc-kitchen-gadget-stress",
      title: "Kitchen gadget stress test",
      promptText: "Kitchen gadget stress test",
    },
    {
      id: "ugc-baby-product-review",
      title: "Baby product honest review",
      promptText: "Baby product honest review",
    },
    {
      id: "ugc-room-makeover",
      title: "Room makeover one product",
      promptText: "Room makeover one product",
    },
    {
      id: "ugc-fashion-try-on",
      title: "Fashion try-on rating",
      promptText: "Fashion try-on rating",
    },
    {
      id: "ugc-cleaning-asmr",
      title: "Cleaning before/after ASMR",
      promptText: "Cleaning before/after ASMR",
    },
    {
      id: "ugc-morning-routine",
      title: "Morning routine product placement",
      promptText: "Morning routine product placement",
    },
    {
      id: "ugc-subscription-box",
      title: "Subscription box first open",
      promptText: "Subscription box first open",
    },
    {
      id: "ugc-pet-toy-reaction",
      title: "Pet toy reaction compilation",
      promptText: "Pet toy reaction compilation",
    },
    {
      id: "ugc-wellness-supplement",
      title: "Wellness supplement journey",
      promptText: "Wellness supplement journey",
    },
    {
      id: "ugc-taste-test-reaction",
      title: "Taste test honest reaction",
      promptText: "Taste test honest reaction",
    },
    {
      id: "ugc-gaming-accessory",
      title: "Gaming accessory setup reveal",
      promptText: "Gaming accessory setup reveal",
    },
  ],

  game: [
    {
      id: "game-rpg-boss-fight",
      title: "RPG boss fight cinematic",
      promptText: "RPG boss fight cinematic",
    },
    {
      id: "game-puzzle-solve",
      title: "Puzzle game satisfying solve",
      promptText: "Puzzle game satisfying solve",
    },
    {
      id: "game-open-world-reveal",
      title: "Open world first-person reveal",
      promptText: "Open world first-person reveal",
    },
    {
      id: "game-strategy-base-timelapse",
      title: "Strategy game base timelapse",
      promptText: "Strategy game base timelapse",
    },
    {
      id: "game-horror-jump-scare",
      title: "Horror game jump scare tease",
      promptText: "Horror game jump scare tease",
    },
    {
      id: "game-racing-speed-rush",
      title: "Racing game POV speed rush",
      promptText: "Racing game POV speed rush",
    },
    {
      id: "game-idle-progression",
      title: "Idle game progression dopamine",
      promptText: "Idle game progression dopamine",
    },
    {
      id: "game-choose-path-horror",
      title: "Choose-your-path horror",
      promptText: "Choose-your-path horror",
    },
    {
      id: "game-card-battle-combo",
      title: "Card battle combo chain",
      promptText: "Card battle combo chain",
    },
    {
      id: "game-survival-night-defense",
      title: "Survival crafting night defense",
      promptText: "Survival crafting night defense",
    },
    {
      id: "game-gacha-summon",
      title: "Anime gacha character summon",
      promptText: "Anime gacha character summon",
    },
    {
      id: "game-asmr-sorting",
      title: "ASMR sorting satisfaction",
      promptText: "ASMR sorting satisfaction",
    },
    {
      id: "game-tycoon-empire",
      title: "Tycoon empire overview",
      promptText: "Tycoon empire overview",
    },
    {
      id: "game-fighting-character-select",
      title: "Fighting game character select",
      promptText: "Fighting game character select",
    },
  ],

  musicVideo: [
    {
      id: "mv-hiphop-rooftop",
      title: "Hip-hop rooftop power shot",
      promptText: "Hip-hop rooftop power shot",
    },
    {
      id: "mv-rnb-bedroom",
      title: "R&B bedroom intimacy",
      promptText: "R&B bedroom intimacy",
    },
    {
      id: "mv-pop-choreography",
      title: "Pop choreography color burst",
      promptText: "Pop choreography color burst",
    },
    {
      id: "mv-rock-live-raw",
      title: "Rock live performance raw energy",
      promptText: "Rock live performance raw energy",
    },
    {
      id: "mv-electronic-abstract",
      title: "Electronic abstract visual sync",
      promptText: "Electronic abstract visual sync",
    },
    {
      id: "mv-indie-folk-nature",
      title: "Indie folk nature wandering",
      promptText: "Indie folk nature wandering",
    },
    {
      id: "mv-kpop-street-formation",
      title: "K-pop group street formation",
      promptText: "K-pop group street formation",
    },
    {
      id: "mv-jazz-club-smoky",
      title: "Jazz club smoky close-up",
      promptText: "Jazz club smoky close-up",
    },
    {
      id: "mv-latin-dance-heat",
      title: "Latin dance heat and color",
      promptText: "Latin dance heat and color",
    },
    {
      id: "mv-ambient-dreamscape",
      title: "Ambient/electronic dreamscape",
      promptText: "Ambient/electronic dreamscape",
    },
    {
      id: "mv-one-take-corridor",
      title: "Music video one-take corridor",
      promptText: "Music video one-take corridor",
    },
    {
      id: "mv-sunset-drive",
      title: "Sunset drive windows-down",
      promptText: "Sunset drive windows-down",
    },
    {
      id: "mv-concert-crowd",
      title: "Concert crowd energy",
      promptText: "Concert crowd energy",
    },
  ],

  shortDrama: [
    {
      id: "sd-revenge-gala",
      title: "Revenge: the gala entrance",
      promptText: "Revenge: the gala entrance",
    },
    {
      id: "sd-romance-elevator",
      title: "Romance: elevator stuck",
      promptText: "Romance: elevator stuck",
    },
    {
      id: "sd-thriller-hidden-camera",
      title: "Thriller: hidden camera found",
      promptText: "Thriller: hidden camera found",
    },
    {
      id: "sd-family-letter",
      title: "Family: letter from beyond",
      promptText: "Family: letter from beyond",
    },
    {
      id: "sd-office-intern-truth",
      title: "Office: intern reveals the truth",
      promptText: "Office: intern reveals the truth",
    },
    {
      id: "sd-medical-dilemma",
      title: "Medical: doctor's dilemma",
      promptText: "Medical: doctor's dilemma",
    },
    {
      id: "sd-campus-rival-ally",
      title: "Campus: rival becomes ally",
      promptText: "Campus: rival becomes ally",
    },
    {
      id: "sd-identity-princess-switch",
      title: "Identity: princess switch",
      promptText: "Identity: princess switch",
    },
    {
      id: "sd-time-loop-worst-day",
      title: "Time loop: worst day again",
      promptText: "Time loop: worst day again",
    },
    {
      id: "sd-secret-double-life",
      title: "Secret: best friend's double life",
      promptText: "Secret: best friend's double life",
    },
    {
      id: "sd-rags-to-riches-viral",
      title: "Rags to riches: the viral moment",
      promptText: "Rags to riches: the viral moment",
    },
    {
      id: "sd-ghost-romance",
      title: "Ghost romance: first love returns",
      promptText: "Ghost romance: first love returns",
    },
    {
      id: "sd-wrongly-accused-proof",
      title: "Wrongly accused: the proof",
      promptText: "Wrongly accused: the proof",
    },
    {
      id: "sd-roommate-bond",
      title: "Roommate: the unexpected bond",
      promptText: "Roommate: the unexpected bond",
    },
    {
      id: "sd-twin-switch-identity",
      title: "Twin switch: identity crisis",
      promptText: "Twin switch: identity crisis",
    },
  ],

  animation: [
    {
      id: "anim-ghibli-countryside",
      title: "Ghibli countryside golden hour",
      promptText: "Ghibli countryside golden hour",
    },
    {
      id: "anim-cyberpunk-robot",
      title: "Cyberpunk neon robot awakening",
      promptText: "Cyberpunk neon robot awakening",
    },
    {
      id: "anim-anime-sword-sakuga",
      title: "Anime sword strike sakuga",
      promptText: "Anime sword strike sakuga",
    },
    {
      id: "anim-stop-motion-kitchen",
      title: "Stop motion clay kitchen chaos",
      promptText: "Stop motion clay kitchen chaos",
    },
    {
      id: "anim-underwater-3d",
      title: "Underwater world 3D exploration",
      promptText: "Underwater world 3D exploration",
    },
    {
      id: "anim-pixel-art-retro",
      title: "Pixel art retro game world",
      promptText: "Pixel art retro game world",
    },
    {
      id: "anim-kinetic-typography",
      title: "Motion graphics kinetic typography",
      promptText: "Motion graphics kinetic typography",
    },
    {
      id: "anim-dragon-flight",
      title: "Dragon flight over mountains",
      promptText: "Dragon flight over mountains",
    },
    {
      id: "anim-toy-midnight",
      title: "Toy world midnight adventure",
      promptText: "Toy world midnight adventure",
    },
    {
      id: "anim-superhero-transform",
      title: "Superhero transformation sequence",
      promptText: "Superhero transformation sequence",
    },
    {
      id: "anim-paper-craft-storybook",
      title: "Paper craft storybook opening",
      promptText: "Paper craft storybook opening",
    },
    {
      id: "anim-abstract-paint-blob",
      title: "Abstract paint-blob genesis",
      promptText: "Abstract paint-blob genesis",
    },
    {
      id: "anim-chibi-food-kitchen",
      title: "Chibi food character kitchen",
      promptText: "Chibi food character kitchen",
    },
    {
      id: "anim-mecha-launch",
      title: "Mecha launch sci-fi anime",
      promptText: "Mecha launch sci-fi anime",
    },
  ],
};
