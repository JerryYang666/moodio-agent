export function probeVideoDurationFromUrl(
  url: string,
  timeoutMs = 10_000
): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const cleanup = () => {
      video.src = "";
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve(0);
    }, timeoutMs);
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      const d = Number.isFinite(video.duration) ? video.duration : 0;
      cleanup();
      resolve(d);
    };
    video.onerror = () => {
      clearTimeout(timer);
      cleanup();
      resolve(0);
    };
    video.src = url;
  });
}

export function probeVideoDurationFromFile(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  return probeVideoDurationFromUrl(url).finally(() => URL.revokeObjectURL(url));
}
