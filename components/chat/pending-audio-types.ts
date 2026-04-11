export type PendingAudioSource = "upload" | "library";

export interface PendingAudio {
  audioId: string;
  url: string;
  source: PendingAudioSource;
  title?: string;
  isUploading?: boolean;
  localPreviewUrl?: string;
}

export const MAX_PENDING_AUDIOS = 1;

export function canAddAudio(pendingAudios: PendingAudio[]): boolean {
  return pendingAudios.length < MAX_PENDING_AUDIOS;
}

export function hasUploadingAudios(pendingAudios: PendingAudio[]): boolean {
  return pendingAudios.some((a) => a.isUploading);
}
