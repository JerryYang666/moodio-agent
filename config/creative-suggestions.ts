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
      promptText: "Cherry blossom encounter, Generate a video using Seedance 1.5, 8s, 16:9, 1080p",
      imageId: "424ba619-4959-42e4-bce2-ac52b51d1e1b",
      imageUrl: `${CDN_BASE}/424ba619-4959-42e4-bce2-ac52b51d1e1b`,
    },
    {
      id: "film-abandoned-house",
      title: "Abandoned house threshold",
      promptText: "Abandoned house threshold, Generate a video using Kling V3 Pro, 10s, 16:9, 1080p",
      imageId: "61bcfb4a-98f6-40aa-9bb5-9c096992106f",
      imageUrl: `${CDN_BASE}/61bcfb4a-98f6-40aa-9bb5-9c096992106f`,
    },
    {
      id: "film-cavalry-charge",
      title: "Cavalry charge at dawn",
      promptText: "Cavalry charge at dawn, Generate a video using Seedance 1.5, 12s, 16:9, 1080p",
      imageId: "ef8c21e9-8ec2-4ff3-a386-04b7378cbaea",
      imageUrl: `${CDN_BASE}/ef8c21e9-8ec2-4ff3-a386-04b7378cbaea`,
    },
    {
      id: "film-underwater-awakening",
      title: "Underwater awakening",
      promptText: "Underwater awakening, Generate a video using Kling V3 Pro, 10s, 16:9, 1080p",
      imageId: "0cee3184-9e98-4d54-935e-9a5034c455ec",
      imageUrl: `${CDN_BASE}/0cee3184-9e98-4d54-935e-9a5034c455ec`,
    },
    {
      id: "film-interrogation-room",
      title: "Interrogation room stillness",
      promptText: "Interrogation room stillness, Generate a video using Seedance 1.5, 10s, 16:9, 1080p",
      imageId: "992c9b59-e4c2-4ad8-a2df-c7153b1e7988",
      imageUrl: `${CDN_BASE}/992c9b59-e4c2-4ad8-a2df-c7153b1e7988`,
    },
    {
      id: "film-childhood-summer",
      title: "Childhood summer flashback",
      promptText: "Childhood summer flashback, Generate a video using Kling V3 Pro, 10s, 16:9, 1080p",
      imageId: "45a42953-5c70-45bb-97e8-e1dfa6e9e3e1",
      imageUrl: `${CDN_BASE}/45a42953-5c70-45bb-97e8-e1dfa6e9e3e1`,
    },
    {
      id: "film-car-pursuit",
      title: "Rain-soaked car pursuit",
      promptText: "Rain-soaked car pursuit, Generate a video using Seedance 1.5, 10s, 16:9, 1080p",
      imageId: "3779e580-6445-49d2-9100-07c860e35959",
      imageUrl: `${CDN_BASE}/3779e580-6445-49d2-9100-07c860e35959`,
    },
    {
      id: "film-blade-duel",
      title: "Blade duel in rain",
      promptText: "Blade duel in rain, Generate a video using Kling V3 Pro, 10s, 21:9, 1080p",
      imageId: "b6a0fbec-2f95-4b91-bb93-eb7197f28fa8",
      imageUrl: `${CDN_BASE}/b6a0fbec-2f95-4b91-bb93-eb7197f28fa8`,
    },
    {
      id: "film-spotlight-performer",
      title: "Spotlight performer",
      promptText: "Spotlight performer, Generate a video using Seedance 1.5, 8s, 16:9, 1080p",
      imageId: "dcf9b96c-2040-445e-85c3-5eb7bf55d1d5",
      imageUrl: `${CDN_BASE}/dcf9b96c-2040-445e-85c3-5eb7bf55d1d5`,
    },
    {
      id: "film-summit-first-light",
      title: "Summit at first light",
      promptText: "Summit at first light, Generate a video using Kling V3 Pro, 10s, 16:9, 1080p",
      imageId: "89ced25d-52a6-41f3-850a-f4d63f7bef9e",
      imageUrl: `${CDN_BASE}/89ced25d-52a6-41f3-850a-f4d63f7bef9e`,
    },
    {
      id: "film-rooftop-confession",
      title: "Midnight rooftop confession",
      promptText: "Midnight rooftop confession, Generate a video using Seedance 1.5, 10s, 16:9, 1080p",
      imageId: "97a19246-8a9a-42c5-9282-8b1d7c221450",
      imageUrl: `${CDN_BASE}/97a19246-8a9a-42c5-9282-8b1d7c221450`,
    },
    {
      id: "film-train-window",
      title: "Train window passage of time",
      promptText: "Train window passage of time, Generate a video using Kling V3 Pro, 10s, 16:9, 1080p",
      imageId: "362855e8-0dff-47e4-b5fa-c07fb4e60363",
      imageUrl: `${CDN_BASE}/362855e8-0dff-47e4-b5fa-c07fb4e60363`,
    },
    {
      id: "film-noir-chase",
      title: "Rain-soaked noir chase",
      promptText: "Rain-soaked noir chase, Generate a video using Kling V3 Pro, 10s, 16:9, 1080p",
      imageId: "6defa153-aca1-4fab-8b41-dfe77c1fc5df",
      imageUrl: `${CDN_BASE}/6defa153-aca1-4fab-8b41-dfe77c1fc5df`,
    },
    {
      id: "film-desert-standoff",
      title: "Desert standoff at golden hour",
      promptText: "Desert standoff at golden hour, Generate a video using Seedance 1.5, 10s, 21:9, 1080p",
      imageId: "867caee4-d90d-4950-b12d-160ade40bb72",
      imageUrl: `${CDN_BASE}/867caee4-d90d-4950-b12d-160ade40bb72`,
    },
    {
      id: "film-space-station",
      title: "Space station reveal",
      promptText: "Space station reveal, Generate a video using Kling V3 Pro, 10s, 16:9, 1080p",
      imageId: "4c5dd9a5-e059-4660-95ff-99cd330c8906",
      imageUrl: `${CDN_BASE}/4c5dd9a5-e059-4660-95ff-99cd330c8906`,
    },
  ],

  ugcAd: [
    {
      id: "ugc-pet-food-taste-test",
      title: "Pet food taste test",
      promptText: "Pet food taste test, Generate a video using Kling V3 Pro, 10s, 9:16, 1080p",
    },
    {
      id: "ugc-skincare-morning-routine",
      title: "Skincare morning routine",
      promptText: "Skincare morning routine, Generate a video using Seedance 1.5, 10s, 9:16, 1080p",
    },
    {
      id: "ugc-tech-gadget-unboxing",
      title: "Tech gadget unboxing",
      promptText: "Tech gadget unboxing, Generate a video using Kling V3 Pro, 10s, 9:16, 1080p",
    },
    {
      id: "ugc-fitness-supplement",
      title: "Fitness supplement before/after",
      promptText: "Fitness supplement before/after, Generate a video using Seedance 1.5, 10s, 9:16, 1080p",
    },
    {
      id: "ugc-kitchen-gadget-stress",
      title: "Kitchen gadget stress test",
      promptText: "Kitchen gadget stress test, Generate a video using Kling V3 Pro, 10s, 9:16, 1080p",
    },
    {
      id: "ugc-baby-product-review",
      title: "Baby product honest review",
      promptText: "Baby product honest review, Generate a video using Seedance 1.5, 10s, 9:16, 1080p",
    },
    {
      id: "ugc-room-makeover",
      title: "Room makeover one product",
      promptText: "Room makeover one product, Generate a video using Kling V3 Pro, 10s, 9:16, 1080p",
    },
    {
      id: "ugc-fashion-try-on",
      title: "Fashion try-on rating",
      promptText: "Fashion try-on rating, Generate a video using Seedance 1.5, 10s, 9:16, 1080p",
    },
    {
      id: "ugc-cleaning-asmr",
      title: "Cleaning before/after ASMR",
      promptText: "Cleaning before/after ASMR, Generate a video using Kling V3 Pro, 8s, 9:16, 1080p",
    },
    {
      id: "ugc-morning-routine",
      title: "Morning routine product placement",
      promptText: "Morning routine product placement, Generate a video using Seedance 1.5, 10s, 9:16, 1080p",
    },
    {
      id: "ugc-subscription-box",
      title: "Subscription box first open",
      promptText: "Subscription box first open, Generate a video using Kling V3 Pro, 10s, 9:16, 1080p",
    },
    {
      id: "ugc-pet-toy-reaction",
      title: "Pet toy reaction compilation",
      promptText: "Pet toy reaction compilation, Generate a video using Seedance 1.5, 8s, 9:16, 1080p",
    },
    {
      id: "ugc-wellness-supplement",
      title: "Wellness supplement journey",
      promptText: "Wellness supplement journey, Generate a video using Kling V3 Pro, 10s, 9:16, 1080p",
    },
    {
      id: "ugc-taste-test-reaction",
      title: "Taste test honest reaction",
      promptText: "Taste test honest reaction, Generate a video using Seedance 1.5, 8s, 9:16, 1080p",
    },
    {
      id: "ugc-gaming-accessory",
      title: "Gaming accessory setup reveal",
      promptText: "Gaming accessory setup reveal, Generate a video using Kling V3 Pro, 10s, 9:16, 1080p",
    },
  ],

  game: [
    {
      id: "game-rpg-boss-fight",
      title: "RPG boss fight cinematic",
      promptText: "RPG boss fight cinematic, Generate a video using Kling V3 Pro, 10s, 16:9, 1080p",
    },
    {
      id: "game-puzzle-solve",
      title: "Puzzle game satisfying solve",
      promptText: "Puzzle game satisfying solve, Generate a video using Seedance 1.5, 8s, 9:16, 1080p",
    },
    {
      id: "game-open-world-reveal",
      title: "Open world first-person reveal",
      promptText: "Open world first-person reveal, Generate a video using Kling V3 Pro, 10s, 16:9, 1080p",
    },
    {
      id: "game-strategy-base-timelapse",
      title: "Strategy game base timelapse",
      promptText: "Strategy game base timelapse, Generate a video using Seedance 1.5, 10s, 9:16, 1080p",
    },
    {
      id: "game-horror-jump-scare",
      title: "Horror game jump scare tease",
      promptText: "Horror game jump scare tease, Generate a video using Kling V3 Pro, 8s, 9:16, 1080p",
    },
    {
      id: "game-racing-speed-rush",
      title: "Racing game POV speed rush",
      promptText: "Racing game POV speed rush, Generate a video using Kling V3 Pro, 8s, 16:9, 1080p",
    },
    {
      id: "game-idle-progression",
      title: "Idle game progression dopamine",
      promptText: "Idle game progression dopamine, Generate a video using Seedance 1.5, 10s, 9:16, 1080p",
    },
    {
      id: "game-choose-path-horror",
      title: "Choose-your-path horror",
      promptText: "Choose-your-path horror, Generate a video using Kling V3 Pro, 10s, 9:16, 1080p",
    },
    {
      id: "game-card-battle-combo",
      title: "Card battle combo chain",
      promptText: "Card battle combo chain, Generate a video using Seedance 1.5, 8s, 9:16, 1080p",
    },
    {
      id: "game-survival-night-defense",
      title: "Survival crafting night defense",
      promptText: "Survival crafting night defense, Generate a video using Kling V3 Pro, 10s, 16:9, 1080p",
    },
    {
      id: "game-gacha-summon",
      title: "Anime gacha character summon",
      promptText: "Anime gacha character summon, Generate a video using Seedance 1.5, 8s, 9:16, 1080p",
    },
    {
      id: "game-asmr-sorting",
      title: "ASMR sorting satisfaction",
      promptText: "ASMR sorting satisfaction, Generate a video using Seedance 1.5, 8s, 9:16, 1080p",
    },
    {
      id: "game-tycoon-empire",
      title: "Tycoon empire overview",
      promptText: "Tycoon empire overview, Generate a video using Kling V3 Pro, 10s, 16:9, 1080p",
    },
    {
      id: "game-fighting-character-select",
      title: "Fighting game character select",
      promptText: "Fighting game character select, Generate a video using Seedance 1.5, 10s, 16:9, 1080p",
    },
  ],

  musicVideo: [
    {
      id: "mv-hiphop-rooftop",
      title: "Hip-hop rooftop power shot",
      promptText: "Hip-hop rooftop power shot, Generate a video using Kling V3 Pro, 10s, 16:9, 1080p",
    },
    {
      id: "mv-rnb-bedroom",
      title: "R&B bedroom intimacy",
      promptText: "R&B bedroom intimacy, Generate a video using Seedance 1.5, 10s, 16:9, 1080p",
    },
    {
      id: "mv-pop-choreography",
      title: "Pop choreography color burst",
      promptText: "Pop choreography color burst, Generate a video using Kling V3 Pro, 8s, 16:9, 1080p",
    },
    {
      id: "mv-rock-live-raw",
      title: "Rock live performance raw energy",
      promptText: "Rock live performance raw energy, Generate a video using Seedance 1.5, 10s, 16:9, 1080p",
    },
    {
      id: "mv-electronic-abstract",
      title: "Electronic abstract visual sync",
      promptText: "Electronic abstract visual sync, Generate a video using Kling V3 Pro, 8s, 16:9, 1080p",
    },
    {
      id: "mv-indie-folk-nature",
      title: "Indie folk nature wandering",
      promptText: "Indie folk nature wandering, Generate a video using Seedance 1.5, 10s, 16:9, 1080p",
    },
    {
      id: "mv-kpop-street-formation",
      title: "K-pop group street formation",
      promptText: "K-pop group street formation, Generate a video using Kling V3 Pro, 8s, 16:9, 1080p",
    },
    {
      id: "mv-jazz-club-smoky",
      title: "Jazz club smoky close-up",
      promptText: "Jazz club smoky close-up, Generate a video using Seedance 1.5, 10s, 16:9, 1080p",
    },
    {
      id: "mv-latin-dance-heat",
      title: "Latin dance heat and color",
      promptText: "Latin dance heat and color, Generate a video using Kling V3 Pro, 8s, 16:9, 1080p",
    },
    {
      id: "mv-ambient-dreamscape",
      title: "Ambient/electronic dreamscape",
      promptText: "Ambient/electronic dreamscape, Generate a video using Seedance 1.5, 10s, 16:9, 1080p",
    },
    {
      id: "mv-one-take-corridor",
      title: "Music video one-take corridor",
      promptText: "Music video one-take corridor, Generate a video using Kling V3 Pro, 10s, 16:9, 1080p",
    },
    {
      id: "mv-sunset-drive",
      title: "Sunset drive windows-down",
      promptText: "Sunset drive windows-down, Generate a video using Seedance 1.5, 10s, 16:9, 1080p",
    },
    {
      id: "mv-concert-crowd",
      title: "Concert crowd energy",
      promptText: "Concert crowd energy, Generate a video using Kling V3 Pro, 8s, 16:9, 1080p",
    },
  ],

  shortDrama: [
    {
      id: "sd-revenge-gala",
      title: "Revenge: the gala entrance",
      promptText: "Revenge: the gala entrance, Generate a video using Seedance 1.5, 10s, 9:16, 1080p",
    },
    {
      id: "sd-romance-elevator",
      title: "Romance: elevator stuck",
      promptText: "Romance: elevator stuck, Generate a video using Kling V3 Pro, 10s, 9:16, 1080p",
    },
    {
      id: "sd-thriller-hidden-camera",
      title: "Thriller: hidden camera found",
      promptText: "Thriller: hidden camera found, Generate a video using Seedance 1.5, 10s, 9:16, 1080p",
    },
    {
      id: "sd-family-letter",
      title: "Family: letter from beyond",
      promptText: "Family: letter from beyond, Generate a video using Kling V3 Pro, 10s, 9:16, 1080p",
    },
    {
      id: "sd-office-intern-truth",
      title: "Office: intern reveals the truth",
      promptText: "Office: intern reveals the truth, Generate a video using Seedance 1.5, 10s, 9:16, 1080p",
    },
    {
      id: "sd-medical-dilemma",
      title: "Medical: doctor's dilemma",
      promptText: "Medical: doctor's dilemma, Generate a video using Kling V3 Pro, 10s, 9:16, 1080p",
    },
    {
      id: "sd-campus-rival-ally",
      title: "Campus: rival becomes ally",
      promptText: "Campus: rival becomes ally, Generate a video using Seedance 1.5, 10s, 9:16, 1080p",
    },
    {
      id: "sd-identity-princess-switch",
      title: "Identity: princess switch",
      promptText: "Identity: princess switch, Generate a video using Kling V3 Pro, 10s, 9:16, 1080p",
    },
    {
      id: "sd-time-loop-worst-day",
      title: "Time loop: worst day again",
      promptText: "Time loop: worst day again, Generate a video using Seedance 1.5, 10s, 9:16, 1080p",
    },
    {
      id: "sd-secret-double-life",
      title: "Secret: best friend's double life",
      promptText: "Secret: best friend's double life, Generate a video using Kling V3 Pro, 10s, 9:16, 1080p",
    },
    {
      id: "sd-rags-to-riches-viral",
      title: "Rags to riches: the viral moment",
      promptText: "Rags to riches: the viral moment, Generate a video using Seedance 1.5, 10s, 9:16, 1080p",
    },
    {
      id: "sd-ghost-romance",
      title: "Ghost romance: first love returns",
      promptText: "Ghost romance: first love returns, Generate a video using Kling V3 Pro, 10s, 9:16, 1080p",
    },
    {
      id: "sd-wrongly-accused-proof",
      title: "Wrongly accused: the proof",
      promptText: "Wrongly accused: the proof, Generate a video using Seedance 1.5, 10s, 9:16, 1080p",
    },
    {
      id: "sd-roommate-bond",
      title: "Roommate: the unexpected bond",
      promptText: "Roommate: the unexpected bond, Generate a video using Kling V3 Pro, 10s, 9:16, 1080p",
    },
    {
      id: "sd-twin-switch-identity",
      title: "Twin switch: identity crisis",
      promptText: "Twin switch: identity crisis, Generate a video using Seedance 1.5, 10s, 9:16, 1080p",
    },
  ],

  animation: [
    {
      id: "anim-ghibli-countryside",
      title: "Ghibli countryside golden hour",
      promptText: "Ghibli countryside golden hour, Generate a video using Seedance 1.5, 10s, 16:9, 1080p",
    },
    {
      id: "anim-cyberpunk-robot",
      title: "Cyberpunk neon robot awakening",
      promptText: "Cyberpunk neon robot awakening, Generate a video using Kling V3 Pro, 10s, 16:9, 1080p",
    },
    {
      id: "anim-anime-sword-sakuga",
      title: "Anime sword strike sakuga",
      promptText: "Anime sword strike sakuga, Generate a video using Kling V3 Pro, 8s, 16:9, 1080p",
    },
    {
      id: "anim-stop-motion-kitchen",
      title: "Stop motion clay kitchen chaos",
      promptText: "Stop motion clay kitchen chaos, Generate a video using Seedance 1.5, 8s, 16:9, 1080p",
    },
    {
      id: "anim-underwater-3d",
      title: "Underwater world 3D exploration",
      promptText: "Underwater world 3D exploration, Generate a video using Kling V3 Pro, 10s, 16:9, 1080p",
    },
    {
      id: "anim-pixel-art-retro",
      title: "Pixel art retro game world",
      promptText: "Pixel art retro game world, Generate a video using Seedance 1.5, 8s, 16:9, 1080p",
    },
    {
      id: "anim-kinetic-typography",
      title: "Motion graphics kinetic typography",
      promptText: "Motion graphics kinetic typography, Generate a video using Seedance 1.5, 8s, 16:9, 1080p",
    },
    {
      id: "anim-dragon-flight",
      title: "Dragon flight over mountains",
      promptText: "Dragon flight over mountains, Generate a video using Kling V3 Pro, 10s, 16:9, 1080p",
    },
    {
      id: "anim-toy-midnight",
      title: "Toy world midnight adventure",
      promptText: "Toy world midnight adventure, Generate a video using Seedance 1.5, 10s, 16:9, 1080p",
    },
    {
      id: "anim-superhero-transform",
      title: "Superhero transformation sequence",
      promptText: "Superhero transformation sequence, Generate a video using Kling V3 Pro, 8s, 16:9, 1080p",
    },
    {
      id: "anim-paper-craft-storybook",
      title: "Paper craft storybook opening",
      promptText: "Paper craft storybook opening, Generate a video using Seedance 1.5, 10s, 16:9, 1080p",
    },
    {
      id: "anim-abstract-paint-blob",
      title: "Abstract paint-blob genesis",
      promptText: "Abstract paint-blob genesis, Generate a video using Kling V3 Pro, 8s, 16:9, 1080p",
    },
    {
      id: "anim-chibi-food-kitchen",
      title: "Chibi food character kitchen",
      promptText: "Chibi food character kitchen, Generate a video using Seedance 1.5, 8s, 16:9, 1080p",
    },
    {
      id: "anim-mecha-launch",
      title: "Mecha launch sci-fi anime",
      promptText: "Mecha launch sci-fi anime, Generate a video using Kling V3 Pro, 10s, 16:9, 1080p",
    },
  ],
};
