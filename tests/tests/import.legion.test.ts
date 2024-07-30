import { IEditorData } from "../../src/game/interfaces/config.interface.ts";
import { importLegionFile } from "../../src/helpers/editor.helper.ts";
import { bootstrap } from "../../src/scripts/bootstrap.script.ts";
import { iterateMiscMedia } from "../../src/utils/media.utils.ts";
import { iterateQuestionBank } from "../../src/utils/questions.utils.ts";

export async function importLegionFileTest() {
  await bootstrap();
  await importLegionFile(
    "./resources/example.zip"
  );
  const editorData: IEditorData = JSON.parse(
    Deno.readTextFileSync("./data/data.json")
  );
  const staticDirectory = Deno.readDirSync("./static");
  const secureStaticDirectory = Deno.readDirSync("./static/protected");
  const expectedStaticFiles: string[] = [];
  iterateMiscMedia(editorData.uiConfig.miscImageSrcNames, (name) => {
    expectedStaticFiles.push(name);
  });
  const expectedSecureStaticFiles: string[] = [];
  iterateQuestionBank(editorData.questionBank, (question) => {
    question.mediaSrcName &&
      expectedSecureStaticFiles.push(question.mediaSrcName);
    question.secondaryMediaSrcName &&
      expectedSecureStaticFiles.push(question.secondaryMediaSrcName);
  });
  for (const file of staticDirectory) {
    if (file.isFile) {
      const index = expectedStaticFiles.indexOf(file.name);
      if (index !== -1) {
        expectedStaticFiles.splice(index, 1);
      }
    }
  }
  if (expectedStaticFiles.length > 0) {
    throw new Error(`Missing static files: ${expectedStaticFiles.join(", ")}`);
  }
  for (const file of secureStaticDirectory) {
    if (file.isFile) {
      const index = expectedSecureStaticFiles.indexOf(file.name);
      if (index !== -1) {
        expectedSecureStaticFiles.splice(index, 1);
      }
    }
  }
  if (expectedSecureStaticFiles.length > 0) {
    throw new Error(
      `Missing protected static files: ${expectedSecureStaticFiles.join(", ")}`
    );
  }
}
