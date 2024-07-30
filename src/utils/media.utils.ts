import { IMiscMedia } from "../game/interfaces/config.interface.ts";

export function iterateMiscMedia(
  miscMedia: IMiscMedia,
  cb: (media: string) => void
): void {
  if (miscMedia.players)
    for (const media of miscMedia.players) {
      cb(media);
    }
  for (const src of Object.entries(miscMedia)) {
    if (src[0] === "players") continue;
    if (src[1])
      for (const media of src[1]) {
        cb(media);
      }
  }
}
