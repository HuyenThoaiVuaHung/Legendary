import { State } from "../state/config.interface.ts";
import { StateService } from "./../state/state.service.ts";
import { User } from "./auth.interface.ts";
import { IPlayer } from "../game/interfaces/game.interface.ts";

export class AuthenticationService {
  private readonly tokenMap: Map<string, User> = new Map<string, User>();

  constructor(
    public stateService: StateService
  ) {
    this.stateService.config.subscribe((config) => {
      if (config.state === State.READY) {
        this.tokenMap.clear();
        config.users?.forEach((user) => {
          this.tokenMap.set(user.authHash, user);
        });
      }
    });
  }

  public authenticate(authHash: string): boolean {
    this.tokenMap.set(authHash, {
      ...(this.tokenMap.get(authHash) as User),
      data: {
        ...(this.tokenMap.get(authHash)?.data as IPlayer),
        isReady: true,
      },
    });
    return this.tokenMap.has(authHash);
  }

  public deauthenticate(authHash: string): void {
    this.tokenMap.set(authHash, {
      ...(this.tokenMap.get(authHash) as User),
      data: {
        ...(this.tokenMap.get(authHash)?.data as IPlayer),
        isReady: false,
      },
    });
  }
}
