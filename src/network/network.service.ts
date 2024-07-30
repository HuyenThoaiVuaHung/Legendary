import { Server } from "socket.io";
import { StateService } from "../state/state.service.ts";
import { AuthenticationService } from "../authentication/auth.service.ts";
import { initializeDefaultNamespace } from "./namespaces/default.namespace.ts";
import { LogHelper } from "../helpers/log.helper.ts";
import { serve } from "https://deno.land/std/http/mod.ts";
import { lookup } from "https://deno.land/x/media_types/mod.ts";

export class NetworkService {
  public readonly io: Server;
  constructor(
    public readonly stateService: StateService,
    public readonly authService: AuthenticationService
  ) {
    const opts = {
      cors: {
        origin: "*",
      },
    };
    this.io = new Server(opts);
    stateService.config.subscribe((config) => {
      // if (config.state === State.READY) {
      // }
      initializeDefaultNamespace(this, authService); 
      opts.cors.origin = config.trustedDomain;
      this.io.listen(config.serverPort);
      LogHelper.log("Network service initialized, listening on port " + config.serverPort);
      LogHelper.log("Trusted domain: " + config.trustedDomain);
    });
  }
}
