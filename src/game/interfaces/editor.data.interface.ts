import { IQuestion, O24ControlType } from './game.interface.ts';

export interface IQuestionBank {
  kd: IKdQuestionData;
  vcnv: IVcnvQuestionData;
  tt: ITtQuestionData;
  vd: IVdQuestionData;
  chp: IChpQuestionData;
}

export interface IKdQuestionData {
  o24Questions?: {
    [O24ControlType.MULTIPLAYER]: IQuestion[];
    [O24ControlType.SINGLEPLAYER]: IQuestion[][];
  };
  o23Questions?: IQuestion[][];
}

export interface IVcnvQuestionData {
  questions: IQuestion[];
  cnvMediaSrcs?: string[];
  cnv: string;
  cnvMediaSrcNames: string[];
}

export interface ITtQuestionData {
  questions: IQuestion[];
}
export interface IVdQuestionData {
  questions: IQuestion[][];
}
export interface IChpQuestionData {
  questions: IQuestion[];
}

