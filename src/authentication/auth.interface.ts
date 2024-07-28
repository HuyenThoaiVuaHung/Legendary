import { IPlayer } from '../game/interfaces/game.interface.ts';



export interface AuthResponse {
    versionCheck: boolean;
    tokenCheck: boolean;
}

export interface AuthRequest {
    versionCheck: string;
    token: string;
}

export interface User {
    authHash: string;
    role: Role;
    socketId: string;
    data?: IPlayer; 
}

export enum Role {
    PLAYER,
    ADMIN,
    MC,
    VIEWER
}