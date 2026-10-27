/** Resolve a room's public branding and fallbacks for /api/config. */
import { API_PATHS, BRAND_SLOTS, BrandSlot, PublicUi } from '../contracts/api';
import { Room } from '../rooms/room';
import { DEFAULT_ROOM_ID } from '../rooms/room.registry';

const DEFAULT_BRAND: Record<BrandSlot, string | null> = {
  logo: '/assets/misc/logo.png',
  'logo-long': '/assets/misc/legion.png',
  placeholder: '/assets/misc/placeholder.png',
  background: null,
};

/** Build public UI settings using only media that still exists. */
export function publicUi(room: Room): PublicUi {
  const ui = room.ui.get();
  const brand = { ...DEFAULT_BRAND };
  for (const slot of BRAND_SLOTS) {
    const name = ui.miscImageSrcNames[slot];
    if (name && room.media.resolve('misc', name)) {
      brand[slot] =
        room.id === DEFAULT_ROOM_ID
          ? API_PATHS.mediaFile('misc', name)
          : API_PATHS.roomMediaFile(room.id, 'misc', name);
    }
  }
  return { darkMode: ui.darkMode, palette: ui.pallette, brand };
}
