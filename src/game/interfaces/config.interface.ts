import { IQuestionBank } from "./editor.data.interface.ts";
import { IMatchData } from "./game.interface.ts";

export interface IInterfaceConfig {
  darkMode: boolean;
  pallette: Pallette;
  miscImageSrcNames: IMiscMedia
  miscImageSrc?: IMiscMedia
}
export interface IMiscMedia {
  [key: string]: string | string[] | undefined;
  'logo-long'?: string
  'logo'?: string
  'placeholder'?: string
  'background'?: string
  players?: string[]
}
export enum Pallette {
  RED,
  GREEN,
  BLUE,
  YELLOW,
  CYAN,
  MAGENTA,
  ORANGE,
  CHARTREUSE,
  AZURE,
  VIOLET,
  ROSE
}
export interface IEditorData {
  uiConfig: IInterfaceConfig;
  matchData: IMatchData;
  questionBank: IQuestionBank;
  uid: string;
  dateModified: number;

}
