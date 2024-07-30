import { LogHelper } from '../helpers/log.helper.ts';
import { signal, Signal } from "./../state/signal.factory.ts";
import { State } from "../state/config.interface.ts";
import { StateService } from "./../state/state.service.ts";
import { Role, User } from "./auth.interface.ts";
import { IPlayer } from "../game/interfaces/game.interface.ts";
import { IOHelper } from "../helpers/io.helper.ts";

export class AuthenticationService {
  private readonly tokenMap: Map<string, User> = new Map<string, User>();

  private readonly secureUsers: Signal<User[]> = signal(
    IOHelper.getMatchDataSync().secureUsers
  );

  constructor(public stateService: StateService) {
    this.stateService.config.subscribe((config) => {
      // deno-lint-ignore no-constant-condition
      if (/**config.state === State.READY */ true) {
        this.tokenMap.clear();
        for (const user of this.secureUsers.get()) {
          this.tokenMap.set(user.authHash, user);
        }
        LogHelper.log("Authentication service initialized.");
        console.debug(this.tokenMap);
        console.debug(this.secureUsers.get());
      }
    });
  }
  /**
   * 
   * @param authHash Authentication code that is hashed, used to identify secured users.
   * @returns User object that contains the role of the user.
   */
  public authenticate(authHash: string): User {
    if (this.tokenMap.has(authHash)) {
      const user = this.tokenMap.get(authHash) as User;
      user.data ? (user.data.isReady = true) : null;
      return user;
    } else
      return {
        role: Role.VIEWER,
        authHash: authHash,
      };
  }

  public deauthenticate(authHash: string): void {
    if (this.tokenMap.has(authHash)) {
      const user = this.tokenMap.get(authHash) as User;
      user.data ? (user.data.isReady = false) : null;
    }
  }
}
