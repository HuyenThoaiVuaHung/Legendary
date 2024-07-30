import { LegendaryConfig, State } from "../state/config.interface.ts";
import { LogHelper } from "../helpers/log.helper.ts";
import { IOHelper } from "../helpers/io.helper.ts";
import { environment } from "../../environment.ts";

export async function bootstrap(): Promise<LegendaryConfig> {
  LogHelper.log("Welcome to Legendary!");
  if (!(await IOHelper.ifFileExists("data/legendary.json"))) {
    try {
      await Deno.mkdir("data");
    } catch (_err) {
      LogHelper.log("Data folder already exists, skipping...");
    }
    const configFile = await Deno.createSync("data/legendary.json");

    const emptyConfig: LegendaryConfig = {
      state: State.EMPTY,
      ifSaveLog: false,
      ...environment,
    };
    configFile.writeSync(new TextEncoder().encode(JSON.stringify(emptyConfig)));
    configFile.close();

    LogHelper.log("Legendary config file created.");
  } else
    LogHelper.warn(
      "Legendary config file found, continuing with previous data!"
    );
  try {
    await Deno.mkdir("static/protected", { recursive: true });
  } catch (err) {
    if (!(err instanceof Deno.errors.AlreadyExists)) {
      LogHelper.log("Static files already exists, skipping...");
    }
  }
  return await IOHelper.getData<LegendaryConfig>("data/legendary.json");
}
