/** Persist the editor UI settings associated with one room. */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { BRAND_SLOTS, UiConfig } from '../contracts/api';

const DEFAULT_PALLETTE = 0;
const TEMP_SUFFIX = '.tmp';

/** Reads and atomically writes a room's UI configuration. */
export class UiConfigStore {
  constructor(private readonly path: string) {}

  /** Read settings, falling back to defaults when the file cannot be read. */
  get(): UiConfig {
    try {
      const value = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<UiConfig>;
      const names: UiConfig['miscImageSrcNames'] = {};
      for (const slot of BRAND_SLOTS) {
        const name = value.miscImageSrcNames?.[slot];
        if (typeof name === 'string') names[slot] = name;
      }
      return {
        darkMode: value.darkMode === true,
        pallette:
          typeof value.pallette === 'number' && Number.isFinite(value.pallette)
            ? value.pallette
            : DEFAULT_PALLETTE,
        miscImageSrcNames: names,
      };
    } catch {
      return { darkMode: false, pallette: DEFAULT_PALLETTE, miscImageSrcNames: {} };
    }
  }

  /** Write settings to a temporary file and rename it into place. */
  set(ui: UiConfig): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}${TEMP_SUFFIX}`;
    writeFileSync(tmp, JSON.stringify(ui));
    renameSync(tmp, this.path);
  }
}
