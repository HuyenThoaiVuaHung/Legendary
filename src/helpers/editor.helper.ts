import { LogHelper } from "../helpers/log.helper.ts";
import { decompress } from "https://deno.land/x/zip@v1.2.5/mod.ts";
import { IEditorData } from "../game/interfaces/config.interface.ts";
import { iterateQuestionBank } from "../utils/questions.utils.ts";
import { MatchPosition } from "../game/interfaces/game.interface.ts";
import { environment } from "../../environment.ts";
import { iterateMiscMedia } from "../utils/media.utils.ts";

export async function importLegionFile(
  path: string,
  callbackFn?: (status: FileHandlerStatus) => void
) {
  callbackFn && callbackFn(FileHandlerStatus.UNZIPPING);
  const tmpDir = Deno.makeTempDirSync();
  await decompress(path, tmpDir);
  console.log("Unzipped file to " + tmpDir);
  callbackFn && callbackFn(FileHandlerStatus.WORKING);
  if (!Deno.lstatSync(`${tmpDir}/editorData.json`)) {
    LogHelper.error("Invalid file format.");
    return;
  }
  const editorData: IEditorData = JSON.parse(
    Deno.readTextFileSync(`${tmpDir}/editorData.json`)
  );

  iterateQuestionBank(editorData.questionBank, (question, position) => {
    let path = tmpDir;
    switch (position) {
      case MatchPosition.KD:
        path += "/kd";
        break;
      case MatchPosition.VCNV_QUES:
        path += "/vcnv";
        break;
      case MatchPosition.TT_QUES:
        path += "/tt";
        break;
      case MatchPosition.VD:
        path += "/vd";
        break;
      case MatchPosition.CHP:
        path += "/chp";
        break;
      default:
        break;
    }
    if (question.mediaSrc) {
      if (!Deno.lstatSync(`${path}/${question.mediaSrc}`)) {
        LogHelper.error("Invalid file format.");
        return;
      }
      Deno.copyFileSync(
        `${path}/${question.mediaSrc}`,
        `${environment.mediaPath}/${question.mediaSrc}`
      );
    }
  });
  for (const srcName of editorData.questionBank.vcnv.cnvMediaSrcNames) {
    if (!Deno.lstatSync(`${tmpDir}/vcnv/${srcName}`)) {
      LogHelper.error("Invalid file format.");
      return;
    }
    console.log("Copying " + srcName);
    Deno.copyFileSync(
      `${tmpDir}/vcnv/${srcName}`,
      `${environment.mediaPath}/${srcName}`
    );
  }
  iterateMiscMedia(editorData.uiConfig.miscImageSrcNames, (srcName) => {
    if (!Deno.lstatSync(`${tmpDir}/misc/${srcName}`)) {
      LogHelper.error("Invalid file format.");
      return;
    }
    Deno.copyFileSync(
      `${tmpDir}/misc/${srcName}`,
      `${environment.mediaPath}/${srcName}`
    );
  });

  Deno.writeTextFileSync(environment.dataPath + '/data.json', JSON.stringify(editorData));
  
  callbackFn && callbackFn(FileHandlerStatus.DONE);



  Deno.removeSync(tmpDir, { recursive: true });
}

export enum FileHandlerStatus {
  UPLOADING,
  UNZIPPING,
  WORKING,
  DONE,
}
