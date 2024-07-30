import { IQuestion } from "./../game/interfaces/game.interface.ts";
import { IQuestionBank } from "../game/interfaces/editor.data.interface.ts";
import {
  MatchPosition,
  O24ControlType,
} from "../game/interfaces/game.interface.ts";

export function questionBankFlatten(questionBank: IQuestionBank) {
  const questions: IQuestion[] = [];
  iterateQuestionBank(questionBank, (question) => {
    questions.push(question);
  });
  return questions;
}

export function iterateQuestionBank(
  bank: IQuestionBank,
  iteratingFn: (question: IQuestion, matchPos?: MatchPosition) => void
) {
  if (bank.kd.o23Questions) {
    for (const question of bank.kd.o23Questions.flat()) {
      iteratingFn(question, MatchPosition.KD);
    }
  }
  if (bank.kd.o24Questions) {
    if (bank.kd.o24Questions[O24ControlType.MULTIPLAYER]) {
      for (const question of bank.kd.o24Questions[O24ControlType.MULTIPLAYER]) {
        iteratingFn(question, MatchPosition.KD);
      }
    }
    if (bank.kd.o24Questions[O24ControlType.SINGLEPLAYER]) {
      for (const questionSet of bank.kd.o24Questions[
        O24ControlType.SINGLEPLAYER
      ]) {
        for (const question of questionSet) {
          iteratingFn(question, MatchPosition.KD);
        }
      }
    }
  }
  //   for (const srcName of bank.vcnv.cnvMediaSrcNames) {
  //     if (!(await this.ifFileExists(environment.mediaPath + srcName))) {
  //       return false;
  //     }
  //   }
  for (const question of bank.vcnv.questions) {
    iteratingFn(question, MatchPosition.VCNV_QUES);
  }
  for (const question of bank.tt.questions) {
    iteratingFn(question, MatchPosition.TT_QUES);
  }
  for (const questionSet of bank.vd.questions) {
    for (const question of questionSet) {
      iteratingFn(question, MatchPosition.VD);
    }
  }
  for (const question of bank.chp.questions) {
    iteratingFn(question, MatchPosition.CHP);
  }
}
