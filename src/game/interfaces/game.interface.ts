import { IChpQuestionData, IKdQuestionData, ITtQuestionData, IVcnvQuestionData, IVdQuestionData } from "./editor.data.interface.ts"
// Synced with Legion
export interface IKdData extends IKdQuestionData {
  currentGamemode?: O24ControlType,
  currentQuestionIndex: number,
}
export interface IVcnvData extends IVcnvQuestionData {

}
export interface ITtData extends ITtQuestionData {

}
export interface IVdData extends IVdQuestionData {

}
export interface IChpData extends IChpQuestionData {

}
export interface IUserInfo {
  sessionId: string;
  roleId: number;
  index?: number;
}

export interface IMatchData {
  matchName: string;
  matchVersion: 23 | 24;
  matchPos: MatchPosition;
  players: IPlayer[];
}

export interface IPlayer {
  name: string;
  score: number;
  isReady: boolean;
  picUid?: string;
}
export enum QuestionType {
  TEXT,
  IMAGE,
  AUDIO,
  VIDEO
}

export enum MatchPosition {
  IDLE,
  KD,
  VCNV_QUES,
  VCNV_ANS,
  TT_QUES,
  TT_ANS,
  VD,
  CHP,
  POINTS
}
export interface IQuestion {
  question: string;
  answer: string;
  type: QuestionType;
  value: number;
  mediaSrc?: string;
  mediaSrcName?: string;
  secondaryMediaSrc?: string;
  secondaryMediaSrcName?: string;
}

export enum O24ControlType {
  SINGLEPLAYER = 'SINGLEPLAYER',
  MULTIPLAYER = 'MULTIPLAYER',
}
