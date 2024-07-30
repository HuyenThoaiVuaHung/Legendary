import { MatchData } from "../state/config.interface.ts";
import { environment } from "../../environment.ts";
import { IQuestionBank } from "../game/interfaces/editor.data.interface.ts";
import {
  IMatchData,
  IQuestion,
  O24ControlType,
} from "../game/interfaces/game.interface.ts";
import { LogHelper } from "./log.helper.ts";
import { iterateQuestionBank } from "../utils/questions.utils.ts";

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

  public static getDataSync<T>(path: string): T {
    try {
      return JSON.parse(Deno.readTextFileSync(path));
    } catch (error) {
      LogHelper.error(error.message);
      return null as T;
    }
  }
  public static getMatchDataSync(): MatchData {
    return this.getDataSync<MatchData>("data/data.json");
  }

  public static async checkMediaResources(
    bank: IQuestionBank
  ): Promise<boolean> {
    iterateQuestionBank(bank, async (question) => {
      if (!(await this.ifQuestionMediaExists(question))) {
        return false;
      }
    });
    for (const srcName of bank.vcnv.cnvMediaSrcNames) {
      if (!(await this.ifFileExists(environment.mediaPath + srcName))) {
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
