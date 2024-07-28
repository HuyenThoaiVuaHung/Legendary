import { signal, Signal } from "./signal.factory.ts";
import { environment } from "../../environment.ts";
import { LegendaryConfig, State } from "./config.interface.ts";
import { bootstrap } from "../scripts/bootstrap.script.ts";

export class StateService {
  public config: Signal<LegendaryConfig> = signal({
    state: State.UNINITIALIZED,
    ifSaveLog: false,
    ...environment,
  });

  constructor() {
    this.initAsync();
  }

  private async initAsync() {
    this.config.set(await bootstrap());
  }

  public updateState(state: State): void {
    const config = this.config.get();
    config.state = state;
    this.config.set(config);
  }
}
