/**
 * Encode an AudioBuffer as a 16-bit PCM WAV Blob.
 *
 * Used to convert recorder output (webm/opus on Chrome/Firefox, mp4/AAC on
 * Safari) into a format accepted by our upload validator and by FAL's
 * create-voice endpoint (which takes .mp3/.wav).
 */
export function encodeWavFromAudioBuffer(audioBuffer: AudioBuffer): Blob {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;

  // Interleave channels.
  const frames = audioBuffer.length;
  const interleaved = new Float32Array(frames * numChannels);
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      interleaved[i * numChannels + ch] = audioBuffer.getChannelData(ch)[i];
    }
  }

  const dataSize = interleaved.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bitDepth, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < interleaved.length; i++) {
    const s = Math.max(-1, Math.min(1, interleaved[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export async function blobToWav(input: Blob): Promise<Blob> {
  const arrayBuffer = await input.arrayBuffer();
  const AudioCtx: typeof AudioContext =
    // Safari still keeps webkitAudioContext on window.
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    return encodeWavFromAudioBuffer(audioBuffer);
  } finally {
    // `close` is async in some browsers; fire-and-forget is fine.
    ctx.close?.();
  }
}

function writeAscii(view: DataView, offset: number, s: string) {
  for (let i = 0; i < s.length; i++) {
    view.setUint8(offset + i, s.charCodeAt(i));
  }
}
