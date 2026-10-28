export type DetectedAudio = { ext: "mp3" | "wav" | "ogg"; mime: "audio/mpeg" | "audio/wav" | "audio/ogg" };

const at = (b: Uint8Array, i: number, s: string) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));

export function detectAudio(b: Uint8Array): DetectedAudio | null {
  if (b.length < 12) return null;
  if (at(b, 0, "ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { ext: "mp3", mime: "audio/mpeg" };
  if (at(b, 0, "RIFF") && at(b, 8, "WAVE")) return { ext: "wav", mime: "audio/wav" };
  if (at(b, 0, "OggS")) return { ext: "ogg", mime: "audio/ogg" };
  return null;
}
