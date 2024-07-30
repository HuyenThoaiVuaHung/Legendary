import { User } from "../authentication/auth.interface.ts";
import { IMatchData } from "../game/interfaces/game.interface.ts";

export enum State {
    UNINITIALIZED,
    EMPTY,
    READY
}

export interface LegendaryConfig {
    state: State;
    ifSaveLog: boolean;
    trustedDomain: string
    mediaPath: string,
    dataPath: string,
    configFileName: string,
    serverPort: number,
}

export interface MatchData extends IMatchData {
    secureUsers: User[];
}