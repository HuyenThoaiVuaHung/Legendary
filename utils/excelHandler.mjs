"use strict";

import {
  provideEmptyChpQuestion,
  provideEmptyKdQuestion,
  provideEmptyTtQuestion,
  provideEmptyVdQuestion,
} from "./question.helper.mjs";

import fs from "fs";
const matchDataPath = "match_data/123.json";
const log = await
import("./logger.js").then((module) => module.log);
export default function readExcel(recievedJSON, callback) {
  let kdData = {
    questions: {
      singleplayer: [[], [], [], []],
      multiplayer: [],
    },
    gamemode: "M",
    currentSingleplayerPlayer: 0,
  };
  let vcnvData = {
    questions: [
      {
        id: 1,
        type: "HN",
        value: 10,
        ifOpen: false,
        ifShown: false,
        question: "",
        answer: "",
      },
      {
        id: 2,
        type: "HN",
        value: 10,
        ifOpen: false,
        ifShown: false,
        question: "",
        answer: "",
      },
      {
        id: 3,
        type: "HN",
        value: 10,
        ifOpen: false,
        ifShown: false,
        question: "",
        answer: "",
      },
      {
        id: 4,
        type: "HN",
        value: 10,
        ifOpen: false,
        ifShown: false,
        question: "",
        answer: "",
      },
      {
        id: 5,
        type: "HN",
        value: 10,
        ifOpen: false,
        ifShown: false,
        question: "",
        answer: "",
      },
      {
        id: 6,
        type: "CNV",
        value: 40,
        ifOpen: false,
        ifShown: false,
        question: "",
        answer: "",
      },
    ],
    playerAnswers: [
      {
        answer: "",
        correct: false,
      },
      {
        answer: "",
        correct: false,
      },
      {
        answer: "",
        correct: false,
      },
      {
        answer: "",
        correct: false,
      },
    ],
    showResults: false,
    disabledPlayers: [],
    noOfOpenRows: 0,
    CNVPlayers: [],
  };
  let ttData = {
    questions: [],
    playerAnswers: [
      {
        id: 0,
        answer: "",
        timestamp: 0,
        readableTime: "",
        correct: false,
      },
      {
        id: 1,
        answer: "",
        timestamp: 0,
        readableTime: "",
        correct: false,
      },
      {
        id: 2,
        answer: "",
        timestamp: 0,
        readableTime: "",
        correct: false,
      },
      {
        id: 3,
        answer: "",
        timestamp: 0,
        readableTime: "",
        correct: false,
      },
    ],
    showResults: false,
    currentQuestion: 0,
    showAnswer: false,
    timerStartTimestamp: 0,
  };
  let vdData = {
    questionPools: [[], [], [], []],
    currentPlayerId: 0,
    ifQuestionPickerShowing: false,
    questionPickerArray: [false, false, false, false, false, false],
    ifNSHV: false,
    NSHV: false,
    questions: [],
  };
  let chpData = {
    questions: [],
    playerIDs: [false, false, false, false],
  };
  let kdQCounter = 0;
  let kdCurrentPlayer = 0;
  vdData.questions = [];
  for (let i = 3; i <= 26; i++) {
    if (recievedJSON.kd[i].__EMPTY) {
      let question = provideEmptyKdQuestion();
      question.question = recievedJSON.kd[i].__EMPTY;
      question.answer = recievedJSON.kd[i].__EMPTY_1;
      if (recievedJSON.kd[i].__EMPTY_2) {
        question.type = "P";
        question.audioFilePath = recievedJSON.kd[i].__EMPTY_2;
      } else if (recievedJSON.kd[i].__EMPTY_3) {
        question.type = "A";
        question.audioFilePath = recievedJSON.kd[i].__EMPTY_2;
      } else {
        question.type = "N";
      }
      kdData.questions.singleplayer[kdCurrentPlayer].push(question);
      kdQCounter++;
      if (kdQCounter == 6) {
        kdQCounter = 0;
        kdCurrentPlayer++;
      }
    }
  }
  for (let i = 29; i <= 40; i++) {
    if (recievedJSON.kd[i].__EMPTY) {
      let question = provideEmptyKdQuestion();
      question.question = recievedJSON.kd[i].__EMPTY;
      question.answer = recievedJSON.kd[i].__EMPTY_1;
      if (recievedJSON.kd[i].__EMPTY_2) {
        question.type = "P";
        question.audioFilePath = recievedJSON.kd[i].__EMPTY_2;
      } else if (recievedJSON.kd[i].__EMPTY_3) {
        question.type = "A";
        question.audioFilePath = recievedJSON.kd[i].__EMPTY_2;
      } else {
        question.type = "N";
      }
      kdData.questions.multiplayer.push(question);
    }
  }

  fs.writeFileSync(
    JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath,
    JSON.stringify(kdData)
  );

  log("Hoàn thành nhập đề KD");
  vcnvData.questions[5].answer = recievedJSON.vcnv[1].__EMPTY;
  vcnvData.questions[5].picFileName = recievedJSON.vcnv[1].__EMPTY_2;
  for (let i = 3; i <= 7; i++) {
    vcnvData.questions[i - 3].question = recievedJSON.vcnv[i].__EMPTY;
    vcnvData.questions[i - 3].answer = recievedJSON.vcnv[i].__EMPTY_1;
    vcnvData.questions[i - 3].ifOpen = false;
    vcnvData.questions[i - 3].ifShown = false;
    if (recievedJSON.vcnv[i].__EMPTY_2) {
      vcnvData.questions[i - 3].audioFilePath = recievedJSON.vcnv[i].__EMPTY_2;
      vcnvData.questions[i - 3].type = "HN_S";
    } else {
      vcnvData.questions[i - 3].type = "HN";
    }
  }
  fs.writeFileSync(
    JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath,
    JSON.stringify(vcnvData)
  );

  log("Hoàn thành nhập đề VCNV");
  for (let i = 0; i <= 3; i++) {
    const question = provideEmptyTtQuestion(i + 1);
    if (recievedJSON.tt[i + 2].__EMPTY && recievedJSON.tt[i + 2].__EMPTY_1) {
      question.question = recievedJSON.tt[i + 2].__EMPTY;
      question.answer = recievedJSON.tt[i + 2].__EMPTY_1;
      if (i < 3) {
        question.type = "TT_IMG";
        question.question_image = recievedJSON.tt[i + 2].__EMPTY_2;
        if (recievedJSON.tt[i + 2].__EMPTY_3) {
          question.answer_image = recievedJSON.tt[i + 2].__EMPTY_3;
        }
      } else {
        question.video_name = recievedJSON.tt[i + 2].__EMPTY_2;
        question.type = "TT_VD";
      }
    }
    ttData.questions.push(question);
  }

  fs.writeFileSync(
    JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath,
    JSON.stringify(ttData)
  );

  log("Hoàn thành nhập đề tăng tốc");
  for (let i = 3; i <= 8; i++) {
    const question = provideEmptyVdQuestion();
    question.question = recievedJSON.vd[i].__EMPTY;
    question.answer = recievedJSON.vd[i].__EMPTY_1;

    if (recievedJSON.vd[i]["VỀ ĐÍCH"] == "Câu hỏi 20 điểm") {
      question.value = 20;
    } else {
      question.value = 30;
    }
    if (recievedJSON.vd[i].__EMPTY_2) {
      question.type = "V";
      question.file_name = recievedJSON.vd[i].__EMPTY_2;
    } else if (recievedJSON.vd[i].__EMPTY_3) {
      question.type = "I";
      question.file_name = recievedJSON.vd[i].__EMPTY_3;
    } else if (recievedJSON.vd[i].__EMPTY_4) {
      question.type = "A";
      question.file_name = recievedJSON.vd[i].__EMPTY_4;
    } else {
      question.type = "N";
    }
    vdData.questionPools[0].push(question);
  }
  for (let i = 11; i <= 16; i++) {
    const question = provideEmptyVdQuestion();
    question.question = recievedJSON.vd[i].__EMPTY;
    question.answer = recievedJSON.vd[i].__EMPTY_1;

    if (recievedJSON.vd[i]["VỀ ĐÍCH"] == "Câu hỏi 20 điểm") {
      question.value = 20;
    } else {
      question.value = 30;
    }
    if (recievedJSON.vd[i].__EMPTY_2) {
      question.type = "V";
      question.file_name = recievedJSON.vd[i].__EMPTY_2;
    } else if (recievedJSON.vd[i].__EMPTY_3) {
      question.type = "I";
      question.file_name = recievedJSON.vd[i].__EMPTY_3;
    } else if (recievedJSON.vd[i].__EMPTY_4) {
      question.type = "A";
      question.file_name = recievedJSON.vd[i].__EMPTY_4;
    } else {
      question.type = "N";
    }
    vdData.questionPools[1].push(question);
  }
  for (let i = 19; i <= 24; i++) {
    const question = provideEmptyVdQuestion();
    question.question = recievedJSON.vd[i].__EMPTY;
    question.answer = recievedJSON.vd[i].__EMPTY_1;

    if (recievedJSON.vd[i]["VỀ ĐÍCH"] == "Câu hỏi 20 điểm") {
      question.value = 20;
    } else {
      question.value = 30;
    }
    if (recievedJSON.vd[i].__EMPTY_2) {
      question.type = "V";
      question.file_name = recievedJSON.vd[i].__EMPTY_2;
    } else if (recievedJSON.vd[i].__EMPTY_3) {
      question.type = "I";
      question.file_name = recievedJSON.vd[i].__EMPTY_3;
    } else if (recievedJSON.vd[i].__EMPTY_4) {
      question.type = "A";
      question.file_name = recievedJSON.vd[i].__EMPTY_4;
    } else {
      question.type = "N";
    }
    vdData.questionPools[2].push(question);
  }
  for (let i = 27; i <= 32; i++) {
    const question = provideEmptyVdQuestion();
    question.question = recievedJSON.vd[i].__EMPTY;
    question.answer = recievedJSON.vd[i].__EMPTY_1;

    if (recievedJSON.vd[i]["VỀ ĐÍCH"] == "Câu hỏi 20 điểm") {
      question.value = 20;
    } else {
      question.value = 30;
    }
    if (recievedJSON.vd[i].__EMPTY_2) {
      question.type = "V";
      question.file_name = recievedJSON.vd[i].__EMPTY_2;
    } else if (recievedJSON.vd[i].__EMPTY_3) {
      question.type = "I";
      question.file_name = recievedJSON.vd[i].__EMPTY_3;
    } else if (recievedJSON.vd[i].__EMPTY_4) {
      question.type = "A";
      question.file_name = recievedJSON.vd[i].__EMPTY_4;
    } else {
      question.type = "N";
    }
    vdData.questionPools[3].push(question);
  }
  fs.writeFileSync(
    JSON.parse(fs.readFileSync(matchDataPath)).VedichFilePath,
    JSON.stringify(vdData)
  );

  for (let i = 35; i <= 37; i++) {
    if (recievedJSON.vd[i].__EMPTY && recievedJSON.vd[i].__EMPTY_1) {
      const question = provideEmptyChpQuestion();
      question.question = recievedJSON.vd[i].__EMPTY;
      question.answer = recievedJSON.vd[i].__EMPTY_1;
      chpData.questions.push(question);
    }
  }
  fs.writeFileSync(
    JSON.parse(fs.readFileSync(matchDataPath)).ChpFilePath,
    JSON.stringify(chpData)
  );
  log("Hoàn thành nhập đề Về đích & CHP");
  log("Hoàn thành nhập từ file excel");
  return [kdData, vcnvData, ttData, vdData, chpData];
}
