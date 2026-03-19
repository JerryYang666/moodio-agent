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
      promptText: "Cherry blossom encounter, Generate a video using Seedance 2.0, 8s, 16:9, 1080p",
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
      promptText: "Cavalry charge at dawn, Generate a video using Seedance 2.0, 12s, 16:9, 1080p",
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
      promptText: "Interrogation room stillness, Generate a video using Seedance 2.0, 10s, 16:9, 1080p",
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
      promptText: "Rain-soaked car pursuit, Generate a video using Seedance 2.0, 10s, 16:9, 1080p",
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
      promptText: "Spotlight performer, Generate a video using Seedance 2.0, 8s, 16:9, 1080p",
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
      promptText: "Midnight rooftop confession, Generate a video using Seedance 2.0, 10s, 16:9, 1080p",
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
  ],
};
