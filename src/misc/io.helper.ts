import { environment } from "./../../environment.ts";
import { IQuestionBank } from "../game/interfaces/editor.data.interface.ts";
import {
  IMatchData,
  IQuestion,
  O24ControlType,
} from "../game/interfaces/game.interface.ts";
import { LogHelper } from "./log.helper.ts";

export class IOHelper {
  public static async ifFileExists(path: string): Promise<boolean> {
    try {
      await Deno.lstat(path);
      return true;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return false;
      } else {
        throw new Error(
          "An error occurred while checking if the file exists: " +
            error.message
        );
      }
    }
  }

  public static async getMatchData(): Promise<IMatchData> {
    return await this.getData<IMatchData>("data/match.json");
  }

  public static async getData<T>(path: string): Promise<T> {
    try {
      return JSON.parse(await Deno.readTextFile(path));
    } catch (error) {
      LogHelper.error(error.message);
      return null as T;
    }
  }

  public static async checkMediaResources(
    bank: IQuestionBank,
    progress?: (percent: number) => void
  ): Promise<boolean> {
    progress ? progress(0) : 0;
    if (bank.kd.o23Questions) {
      for (const question of bank.kd.o23Questions.flat()) {
        if (!(await this.ifQuestionMediaExists(question))) {
          return false;
        }
      }
    }
    progress ? progress(10) : 0;
    if (bank.kd.o24Questions) {
      if (bank.kd.o24Questions[O24ControlType.MULTIPLAYER]) {
        for (const question of bank.kd.o24Questions[
          O24ControlType.MULTIPLAYER
        ]) {
          if (!(await this.ifQuestionMediaExists(question))) {
            return false;
          }
        }
      }
      progress ? progress(15) : 0;
      if (bank.kd.o24Questions[O24ControlType.SINGLEPLAYER]) {
        for (const questionSet of bank.kd.o24Questions[
          O24ControlType.SINGLEPLAYER
        ]) {
          for (const question of questionSet) {
            if (!(await this.ifQuestionMediaExists(question))) {
              return false;
            }
          }
        }
      }
    }
    progress ? progress(20) : 0;
    for (const srcName of bank.vcnv.cnvMediaSrcNames) {
      if (!(await this.ifFileExists(environment.mediaPath + srcName))) {
        return false;
      }
    }
    for (const question of bank.vcnv.questions) {
      if (!(await this.ifQuestionMediaExists(question))) {
        return false;
      }
    }
    progress ? progress(40) : 0;
    for (const question of bank.tt.questions) {
      if (!(await this.ifQuestionMediaExists(question))) {
        return false;
      }
    }
    progress ? progress(60) : 0;
    for (const questionSet of bank.vd.questions) {
      for (const question of questionSet) {
        if (!(await this.ifQuestionMediaExists(question))) {
          return false;
        }
      }
    }
    progress ? progress(80) : 0;
    for (const question of bank.chp.questions) {
      if (!(await this.ifQuestionMediaExists(question))) {
        return false;
      }
    }
    return true;
  }
  private static async ifQuestionMediaExists(
    question: IQuestion
  ): Promise<boolean> {
    if (question.mediaSrcName) {
      if (
        !(await this.ifFileExists(
          environment.mediaPath + question.mediaSrcName
        ))
      ) {
        return false;
      }
    }
    if (question.secondaryMediaSrcName) {
      if (
        !(await this.ifFileExists(
          environment.mediaPath + question.secondaryMediaSrcName
        ))
      ) {
        return false;
      }
    }
    return true;
  }
}
