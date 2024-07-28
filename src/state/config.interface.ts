import { User } from "../authentication/auth.interface.ts";

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
    users?: User[]
}