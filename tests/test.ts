import { cleanTestDir } from "./scripts/cleanup.script.ts";
import { importLegionFileTest } from "./tests/import.legion.test.ts";

cleanTestDir();

Deno.test("[import] Legion files", importLegionFileTest);
