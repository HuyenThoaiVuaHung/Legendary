const fs = require("fs");
const io = require("socket.io")(3000, {
  cors: {
    origin: "*",
  },
});

console.log("Server khởi động thành công, đang chờ kết nối mới..");
// Nhập mã bí mật ở đây
var playerSecrets = ["123", "234", "345", "456"];
var adminSecret = "BTC";
var mcSecret = "MC";
// Nhập đường dẫn tới file data trận đấu
var matchDataPath = "match_data/123.json";

var socketIDs = ["", "", "", ""];
var adminId = "";
var matchData = JSON.parse(fs.readFileSync(matchDataPath));
var lastTurnId = "";
let lastStealingPlayerId = -1;
var kdCurrentMaxQuesNo = 0;
var kdCurrentQuestionNo = 0;
var timerActive = false;
var ifFiveSecActive = false;
var chpTurnId = -1;
var chpLastTurnSocketId = "";
let mainTimer = 0;
var playedChp = [false, false, false, false];
var threeSecTimerType = "N"; // N: No timer, A: Admin, P: Player

function doTimer(time) {
  timerActive = true;
  mainTimer = time;
  io.emit("update-clock", mainTimer);
  let interval = setInterval(() => {
    mainTimer--;
    if (mainTimer <= 0 || timerActive == false) {
      clearInterval(interval);
      io.emit("update-clock", 0);
      io.emit("lock-button-chp");
      io.emit("disable-answer-button-kd");
      this.threeSecTimerType = "N";
    } else {
      io.emit("update-clock", mainTimer);
    }
  }, 1000);
}
function playPauseTime() {
  if (timerActive == true) {
    matchData.pauseTime = mainTimer;
    timerActive = false;
    fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
  } else if (matchData.pauseTime != 0 && timerActive == false) {
    doTimer(matchData.pauseTime);
    matchData.pauseTime = 0;
    fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
  }
}
function sortByTimestamp(a, b) {
  if (a.timestamp < b.timestamp) {
    return -1;
  }
  if (a.timestamp > b.timestamp) {
    return 1;
  }
  return 0;
}

io.on("connection", (socket) => {
  io.to(socket.id).emit("reauthenticate");
  socket.on("verify-identity", (authID, callback) => {
    if (playerSecrets.includes(authID)) {
      callback({
        roleId: 0,
      });
    } else if (authID == adminSecret) {
      callback({
        roleId: 1,
      });
    } else if (authID == mcSecret) {
      callback({
        roleId: 2,
      });
    } else {
      callback({
        roleId: 3,
      });
    }
  });
  socket.on("init-authenticate", (authID, callback) => {
    if (playerSecrets.includes(authID)) {
      // Nguoi choi
      matchData.players[playerSecrets.indexOf(authID)].isReady = true;
      curAuthID = authID;
      socketIDs[playerSecrets.indexOf(authID)] = socket.id;
      fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
      console.log(
        "Player " +
          matchData.players[playerSecrets.indexOf(authID)].name +
          " connected at " +
          socket.id
      );
      io.emit("update-match-data", matchData);
      callback({
        roleId: 0,
        matchData: matchData,
        player: matchData.players[playerSecrets.indexOf(authID)],
        playerIndex: playerSecrets.indexOf(authID),
      });
    } else if (authID == adminSecret) {
      // Admin
      console.log("Admin connected at " + socket.id);
      adminId = socket.id;
      callback({
        roleId: 1,
        matchData: matchData,
      });
    } else if (authID == mcSecret) {
      // MC
      console.log("MC connected at " + socket.id);
      callback({
        roleId: 2,
        matchData: matchData,
      });
    } else {
      // Viewer
      console.log("Viewer connected at " + socket.id);
      callback({
        roleId: 3,
        matchData: matchData,
        player: undefined,
        playerIndex: undefined,
      });
    }
  });
  socket.on("get-match-data", (callback) => {
    if (callback) {
      callback(matchData);
    }
  });
  socket.on("disconnect", () => {
    if (socketIDs.includes(socket.id)) {
      console.log(
        "Player " +
          matchData.players[socketIDs.indexOf(socket.id)].name +
          " disconnected at " +
          socket.id
      );
      matchData.players[socketIDs.indexOf(socket.id)].isReady = false;
      fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
      io.emit("update-match-data", matchData);
    }
  });
  socket.on("beginMatch", () => {
    matchData.matchPos = "KD";
    fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
    socket.broadcast.emit("beginMatch");
  });
  socket.on("change-match-position", (matchPos, authID) => {
    if (socket.id == adminId) {
      matchData.matchPos = matchPos;
      fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
      io.emit("update-match-data", matchData);
    } else if (authID) {
      if (authID == adminSecret) {
        matchData.matchPos = matchPos;
        fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
        io.emit("update-match-data", matchData);
      }
    }
  });
  socket.on("update-data-from-excel", (recievedJSON, callback) => {
    if (socket.id == adminId) {
      let kdData = JSON.parse(
        fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath)
      );
      let vcnvData = JSON.parse(
        fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath)
      );
      let ttData = JSON.parse(
        fs.readFileSync(
          JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath
        )
      );
      let vdData = JSON.parse(
        fs.readFileSync(
          JSON.parse(fs.readFileSync(matchDataPath)).VedichFilePath
        )
      );
      let chpData = JSON.parse(
        fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).ChpFilePath)
      );
      kdData.questions.singleplayer = [[], [], [], []];
      kdData.questions.multiplayer = [];
      let kdCurrentPlayer = 0;
      let kdQCounter = 0;
      vdData.questions = [];
      for (let i = 3; i <= 26; i++) {
        if (recievedJSON.kd[i].__EMPTY) {
          let question = {};
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
          let question = {};
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
      io.emit("update-kd-data-admin", kdData);
      console.log("Hoàn thành nhập đề KD");
      vcnvData.questions[5].answer = recievedJSON.vcnv[1].__EMPTY;
      vcnvData.questions[5].picFileName = recievedJSON.vcnv[1].__EMPTY_2;
      for (let i = 3; i <= 7; i++) {
        vcnvData.questions[i - 3].question = recievedJSON.vcnv[i].__EMPTY;
        vcnvData.questions[i - 3].answer = recievedJSON.vcnv[i].__EMPTY_1;
        vcnvData.questions[i - 3].ifOpen = false;
        vcnvData.questions[i - 3].ifShown = false;
        if (recievedJSON.vcnv[i].__EMPTY_2) {
          vcnvData.questions[i - 3].audioFilePath =
            recievedJSON.vcnv[i].__EMPTY_2;
          vcnvData.questions[i - 3].type = "HN_S";
        } else {
          vcnvData.questions[i - 3].type = "HN";
        }
      }
      fs.writeFileSync(
        JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath,
        JSON.stringify(vcnvData)
      );
      io.emit("update-vcnv-data", vcnvData);
      console.log("Hoàn thành nhập đề VCNV");
      for (let i = 0; i <= 3; i++) {
        if (
          recievedJSON.tt[i + 2].__EMPTY &&
          recievedJSON.tt[i + 2].__EMPTY_1
        ) {
          ttData.questions[i].question = recievedJSON.tt[i + 2].__EMPTY;
          ttData.questions[i].answer = recievedJSON.tt[i + 2].__EMPTY_1;
          if (i < 3) {
            ttData.questions[i].type = "TT_IMG";
            ttData.questions[i].question_image =
              recievedJSON.tt[i + 2].__EMPTY_2;
            if (recievedJSON.tt[i + 2].__EMPTY_3) {
              ttData.questions[i].answer_image =
                recievedJSON.tt[i + 2].__EMPTY_3;
            }
          } else {
            ttData.questions[i].video_name = recievedJSON.tt[i + 2].__EMPTY_2;
            ttData.questions[i].type = "TT_VD";
          }
        }
      }

      fs.writeFileSync(
        JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath,
        JSON.stringify(ttData)
      );
      io.emit("update-tangtoc-data", ttData);
      console.log("Hoàn thành nhập đề tăng tốc");
      for (let i = 3; i <= 8; i++) {
        vdData.questionPools[0][i - 3].question = recievedJSON.vd[i].__EMPTY;
        vdData.questionPools[0][i - 3].answer = recievedJSON.vd[i].__EMPTY_1;
        if (recievedJSON.vd[i]["VỀ ĐÍCH"] == "Câu hỏi 20 điểm") {
          vdData.questionPools[0][i - 3].value = 20;
        } else {
          vdData.questionPools[0][i - 3].value = 30;
        }
        if (recievedJSON.vd[i].__EMPTY_2) {
          vdData.questionPools[0][i - 3].type = "V";
          vdData.questionPools[0][i - 3].file_name =
            recievedJSON.vd[i].__EMPTY_2;
        } else if (recievedJSON.vd[i].__EMPTY_3) {
          vdData.questionPools[0][i - 3].type = "I";
          vdData.questionPools[0][i - 3].file_name =
            recievedJSON.vd[i].__EMPTY_3;
        } else if (recievedJSON.vd[i].__EMPTY_4) {
          vdData.questionPools[0][i - 3].type = "A";
          vdData.questionPools[0][i - 3].file_name =
            recievedJSON.vd[i].__EMPTY_4;
        } else {
          vdData.questionPools[0][i - 3].type = "N";
        }
      }
      for (let i = 11; i <= 16; i++) {
        vdData.questionPools[1][i - 11].question = recievedJSON.vd[i].__EMPTY;
        vdData.questionPools[1][i - 11].answer = recievedJSON.vd[i].__EMPTY_1;
        if (recievedJSON.vd[i]["VỀ ĐÍCH"] == "Câu hỏi 20 điểm") {
          vdData.questionPools[1][i - 11].value = 20;
        } else {
          vdData.questionPools[1][i - 11].value = 30;
        }
        if (recievedJSON.vd[i].__EMPTY_2) {
          vdData.questionPools[1][i - 11].type = "V";
          vdData.questionPools[1][i - 11].file_name =
            recievedJSON.vd[i].__EMPTY_2;
        } else if (recievedJSON.vd[i].__EMPTY_3) {
          vdData.questionPools[1][i - 11].type = "I";
          vdData.questionPools[1][i - 11].file_name =
            recievedJSON.vd[i].__EMPTY_3;
        } else if (recievedJSON.vd[i].__EMPTY_4) {
          vdData.questionPools[1][i - 11].type = "A";
          vdData.questionPools[1][i - 11].file_name =
            recievedJSON.vd[i].__EMPTY_4;
        } else {
          vdData.questionPools[1][i - 11].type = "N";
        }
      }
      for (let i = 19; i <= 24; i++) {
        vdData.questionPools[2][i - 19].question = recievedJSON.vd[i].__EMPTY;
        vdData.questionPools[2][i - 19].answer = recievedJSON.vd[i].__EMPTY_1;
        if (recievedJSON.vd[i]["VỀ ĐÍCH"] == "Câu hỏi 20 điểm") {
          vdData.questionPools[2][i - 19].value = 20;
        } else {
          vdData.questionPools[2][i - 19].value = 30;
        }
        if (recievedJSON.vd[i].__EMPTY_2) {
          vdData.questionPools[2][i - 19].type = "V";
          vdData.questionPools[2][i - 19].file_name =
            recievedJSON.vd[i].__EMPTY_2;
        } else if (recievedJSON.vd[i].__EMPTY_3) {
          vdData.questionPools[2][i - 19].type = "I";
          vdData.questionPools[2][i - 19].file_name =
            recievedJSON.vd[i].__EMPTY_3;
        } else if (recievedJSON.vd[i].__EMPTY_4) {
          vdData.questionPools[2][i - 19].type = "A";
          vdData.questionPools[2][i - 19].file_name =
            recievedJSON.vd[i].__EMPTY_4;
        } else {
          vdData.questionPools[2][i - 19].type = "N";
        }
      }
      for (let i = 27; i <= 32; i++) {
        vdData.questionPools[3][i - 27].question = recievedJSON.vd[i].__EMPTY;
        vdData.questionPools[3][i - 27].answer = recievedJSON.vd[i].__EMPTY_1;
        if (recievedJSON.vd[i]["VỀ ĐÍCH"] == "Câu hỏi 20 điểm") {
          vdData.questionPools[3][i - 27].value = 20;
        } else {
          vdData.questionPools[3][i - 27].value = 30;
        }
        if (recievedJSON.vd[i].__EMPTY_2) {
          vdData.questionPools[3][i - 27].type = "V";
          vdData.questionPools[3][i - 27].file_name =
            recievedJSON.vd[i].__EMPTY_2;
        } else if (recievedJSON.vd[i].__EMPTY_3) {
          vdData.questionPools[3][i - 27].type = "I";
          vdData.questionPools[3][i - 27].file_name =
            recievedJSON.vd[i].__EMPTY_3;
        } else if (recievedJSON.vd[i].__EMPTY_4) {
          vdData.questionPools[3][i - 27].type = "A";
          vdData.questionPools[3][i - 27].file_name =
            recievedJSON.vd[i].__EMPTY_4;
        } else {
          vdData.questionPools[3][i - 27].type = "N";
        }
      }
      fs.writeFileSync(
        JSON.parse(fs.readFileSync(matchDataPath)).VedichFilePath,
        JSON.stringify(vdData)
      );
      io.emit("update-vedich-data", vdData);
      for (i = 35; i <= 37; i++) {
        if (recievedJSON.vd[i].__EMPTY && recievedJSON.vd[i].__EMPTY_1) {
          chpData.questions[i - 35].question = recievedJSON.vd[i].__EMPTY;
          chpData.questions[i - 35].answer = recievedJSON.vd[i].__EMPTY_1;
        }
      }
      fs.writeFileSync(
        JSON.parse(fs.readFileSync(matchDataPath)).ChpFilePath,
        JSON.stringify(chpData)
      );
      io.emit("update-chp-data", chpData);
      console.log("Hoàn thành nhập đề Về đích & CHP");
      console.log("Hoàn thành nhập từ file excel");
    }
  });
  socket.on("start-clock", (time) => {
    timerActive = false;
    matchData.pauseTime = 0;
    io.emit("enable-answer-button-kd");
    fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
    //pause 1s
    setTimeout(() => {
      doTimer(time);
    }, 1000);
  });
  socket.on("play-pause-clock", () => {
    playPauseTime();
  });
  socket.on("get-kd-data-admin", (callback) => {
    if (adminId == socket.id) {
      callback(
        JSON.parse(
          fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath)
        )
      );
    }
    // Will implement encryption later
    //var kd_questions=JSON.parse(cryptoJS.AES.decrypt(fs.readFileSync(`question_data/kd_questions.json`), questionsPassword ));
  });
  socket.on("change-kd-gamemode", (gamemode, callback) => {
    if (adminId == socket.id) {
      var kd_data = JSON.parse(
        fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath)
      );
      kd_data.gamemode = gamemode;
      fs.writeFileSync(
        JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath,
        JSON.stringify(kd_data)
      );
      io.emit("update-kd-data-admin", kd_data);
      io.emit('update-kd-gamemode', gamemode);
    }
  });
  socket.on('get-kd-gamemode', (callback) => {
    callback(JSON.parse(
      fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath)
    ).gamemode);
    console.log(callback);
  });
  socket.on("edit-kd-question", (payload, callback) => {
    if (adminId == socket.id) {
      var kd_data = JSON.parse(
        fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath)
      );
      kd_data.questions[payload.index] = payload.question;
      fs.writeFileSync(
        JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath,
        JSON.stringify(kd_data)
      );
      socket.emit("update-kd-data-admin", kd_data);
      callback({
        message: "Success",
      });
    }
  })
  socket.on("edit-player-info", (payload, callback) => {
    if (adminId == socket.id) {
      matchData.players[payload.index] = payload.player;
      fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
      io.emit("update-match-data", matchData);
      callback({
        message: "Success",
      });
    }
  });

  socket.on("broadcast-kd-question", (question, callback) => {
    socket.broadcast.emit("update-kd-question", question);
  });
  socket.on("clear-question-kd", () => {
    socket.broadcast.emit("update-kd-question", {});
  });
  socket.on("get-turn-kd", () => {
    if (lastTurnId == "") {
      io.emit("play-sfx", "KD_GET_TURN");
      threeSecTimerType = "P";
      lastTurnId = socket.id;
      io.emit("disable-answer-button-kd");
      io.emit(
        "player-got-turn-kd",
        matchData.players[socketIDs.indexOf(socket.id)]
      );
    }
  });
  socket.on("change-singleplayer-kd-turn", (playerId) => {
    if (socket.id == adminId) {
      var kd_data = JSON.parse(
        fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath)
      );
      kd_data.currentSingleplayerPlayer = playerId - 1;
      fs.writeFileSync(
        JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath,
        JSON.stringify(kd_data)
      );
      socket.emit("update-kd-data-admin", kd_data);
    }
  });
  socket.on("clear-turn-kd", () => {
    lastTurnId = "";
    io.emit("clear-turn-player-kd");
    io.emit("enable-answer-button-kd");
  });
  socket.on("correct-mark-kd", () => {
    io.emit("enable-answer-button-kd");
    var kdData = JSON.parse(
      fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath)
    );
    kdCurrentQuestionNo++;
    io.emit(
      "update-number-question-kd",
      kdCurrentMaxQuesNo,
      kdCurrentQuestionNo
    );
    if (lastTurnId && kdData.gamemode == "M")
      matchData.players[socketIDs.indexOf(lastTurnId)].score += 10;
    else if (kdData.gamemode == "S") {
      matchData.players[kdData.currentSingleplayerPlayer].score += 10;
    }
    fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
    io.emit("update-match-data", matchData);
    threeSecTimerType = "N";
    lastTurnId = "";
  });
  socket.on("wrong-mark-kd", () => {
    io.emit("enable-answer-button-kd");
    if (matchData.players[socketIDs.indexOf(lastTurnId)].score > 0) {
      var kdData = JSON.parse(
        fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath)
      );
      kdCurrentQuestionNo++;
      if (kdData.gamemode == "M")
        matchData.players[socketIDs.indexOf(lastTurnId)].score -= 5;
    }
    kdCurrentQuestionNo++;
    io.emit(
      "update-number-question-kd",
      kdCurrentMaxQuesNo,
      kdCurrentQuestionNo
    );
    fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
    io.emit("update-match-data", matchData);
    threeSecTimerType = "N";
    lastTurnId = "";
  });
  socket.on('stop-kd-sound', () => {
    io.emit('stop-kd-sound');
  })
  socket.on("clear-turn-kd-f", () => {
    this.lastTurnId = "";
    io.emit("clear-turn-player-kd");
  });
  /*
  O21 Rules
  socket.on('wrong-mark-kd', (ifPlayer) => {
    ifLastAnswerCorrect = false;
    if (mainTimer > 0){
      io.emit('enable-answer-button-kd');
    }
    if (ifPlayer == true) {
      console.log(lastTurnId)
      io.to(lastTurnId).emit('disable-answer-button-kd');
    }
    threeSecTimerType = 'N';
    lastTurnId = '';
  })
  */
  socket.on("start-3s-timer-kd", (ifPlayer) => {
    if (ifPlayer) {
      threeSecTimerType = "P";
      let counter = 30;
      io.emit("update-3s-timer-kd", 30, true);
      var interval = setInterval(() => {
        counter--;
        io.emit("update-3s-timer-kd", counter, true);
        if (threeSecTimerType == "N") {
          clearInterval(interval);
          if (mainTimer > 0) {
            io.emit("enable-answer-button-kd");
          }
          lastTurnId = "";
          io.emit("update-3s-timer-kd", 0, true);
          io.emit("update-3s-timer-kd", 0, false);
        } else if (counter == 0) {
          clearInterval(interval);
          if (mainTimer > 0) {
            io.emit("enable-answer-button-kd");
            io.emit("next-question");
          }
          if (threeSecTimerType == "P") {
            threeSecTimerType = "N";
            if (matchData.players[socketIDs.indexOf(lastTurnId)].score > 0) {
              matchData.players[socketIDs.indexOf(lastTurnId)].score -= 5;
            }
            io.emit("update-match-data", matchData);
            fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
            io.emit("play-sfx", "KD_WRONG");
            kdCurrentQuestionNo++;
            io.emit(
              "update-number-question-kd",
              kdCurrentMaxQuesNo,
              kdCurrentQuestionNo
            );
          }
          lastTurnId = "";
          io.emit("clear-turn-player-kd");
        }
      }, 100);
    } else {
      let counter = 30;
      threeSecTimerType = "A";
      io.emit("update-3s-timer-kd", 30, false);
      var interval = setInterval(() => {
        counter--;
        io.emit("update-3s-timer-kd", counter, false);
        if (counter == 0) {
          if (mainTimer > 0) {
            io.emit("next-question");
            io.emit("enable-answer-button-kd");
          }
          io.emit("clear-turn-player-kd");
          io.emit("play-sfx", "KD_WRONG");
          kdCurrentQuestionNo++;
          io.emit(
            "update-number-question-kd",
            kdCurrentMaxQuesNo,
            kdCurrentQuestionNo
          );
          lastTurnId = "";
          clearInterval(interval);
        } else if (threeSecTimerType != "A") {
          clearInterval(interval);
          io.emit("update-3s-timer-kd", 0, false);
        }
      }, 100);
    }
  });
  socket.on("stop-3s-timer-kd", () => {
    threeSecTimerType = "N";
  });
  socket.on("start-turn-kd", (questionNo) => {
    kdCurrentQuestionNo = 0;
    kdCurrentMaxQuesNo = questionNo;
    io.emit(
      "update-number-question-kd",
      kdCurrentMaxQuesNo,
      kdCurrentQuestionNo
    );
    io.emit("enable-answer-button-kd");
    io.emit("update-questions-number-kd", questionNo);
  });
  socket.on("get-vcnv-data", (callback) => {
    callback(
      JSON.parse(
        fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath)
      )
    );
  });
  socket.on("mark-answer-vcnv", (payload) => {
    for (let i = 0; i <= payload.length; i++) {
      if (payload[i] == true) {
        matchData.players[i].score += 10;
      }
      io.emit("update-match-data", matchData);
    }
  });
  socket.on("update-vcnv-data", (payload) => {
    let vcnvData = payload;
    let counter = 0;
    for (let i = 0; i < vcnvData.questions.length; i++) {
      if (vcnvData.questions[i].ifShown == true) {
        counter++;
      }
    }
    switch (counter) {
      case 0:
        vcnvData.questions[5].value = 50;
        break;
      case 1:
        vcnvData.questions[5].value = 50;
        break;
      case 2:
        vcnvData.questions[5].value = 40;
        break;
      case 3:
        vcnvData.questions[5].value = 30;
        break;
      case 4:
        vcnvData.questions[5].value = 20;
        break;
      case 5:
        vcnvData.questions[5].value = 10;
        break;
    }
    fs.writeFileSync(
      JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath,
      JSON.stringify(vcnvData)
    );
    io.emit("update-vcnv-data", vcnvData);
  });
  socket.on("broadcast-vcnv-question", (questionId) => {
    if (questionId < 6) {
      io.emit(
        "update-vcnv-question",
        JSON.parse(
          fs.readFileSync(
            JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath
          )
        ).questions[questionId - 1]
      );
    } else {
      io.emit("update-vcnv-question", { question: "" });
    }
  });
  socket.on("highlight-vcnv-question", (questionId) => {
    io.emit("update-highlighted-vcnv-question", questionId);
  });
  socket.on("submit-answer-vcnv", (answer) => {
    let vcnvData = JSON.parse(
      fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath)
    );
    vcnvData.playerAnswers[socketIDs.indexOf(socket.id)].answer = answer;
    fs.writeFileSync(
      JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath,
      JSON.stringify(vcnvData)
    );
    io.emit("update-vcnv-data", vcnvData);
  });
  socket.on("open-hn-vcnv", (id) => {
    let vcnvData = JSON.parse(
      fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath)
    );
    vcnvData.questions[id - 1].ifOpen = true;
    fs.writeFileSync(
      JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath,
      JSON.stringify(vcnvData)
    );
    fs.writeFileSync(
      JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath,
      JSON.stringify(vcnvData)
    );
    io.emit("update-vcnv-data", vcnvData);
  });
  socket.on("close-hn-vcnv", (id) => {
    let vcnvData = JSON.parse(
      fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath)
    );
    vcnvData.questions[id - 1].ifOpen = false;
    io.emit("update-vcnv-data", vcnvData);
    fs.writeFileSync(
      JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath,
      JSON.stringify(vcnvData)
    );
  });
  socket.on("clear-player-answer", () => {
    //read vcnvFile
    let vcnvData = JSON.parse(
      fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath)
    );
    vcnvData.playerAnswers[socketIDs.indexOf(socket.id)].answer = "";
    vcnvData.playerAnswers[socketIDs.indexOf(socket.id)].correct = false;
    fs.writeFileSync(
      JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath,
      JSON.stringify(vcnvData)
    );
    io.emit("update-vcnv-data", vcnvData);
  });
  socket.on("submit-mark-vcnv-admin", (payload) => {
    let vcnvData = JSON.parse(
      fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath)
    );
    vcnvData.playerAnswers = payload;
    for (let i = 0; i <= 3; i++) {
      if (payload[i].correct == true) {
        matchData.players[i].score += 10;
      }
    }
    io.emit("update-match-data", matchData);
    fs.writeFileSync(
      JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath,
      JSON.stringify(vcnvData)
    );
    fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
  });
  socket.on("toggle-results-display-vcnv", () => {
    let vcnvData = JSON.parse(
      fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath)
    );
    vcnvData.showResults = !vcnvData.showResults;
    fs.writeFileSync(
      JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath,
      JSON.stringify(vcnvData)
    );
    io.emit("update-vcnv-data", vcnvData);
    console.log(vcnvData.showResults);
  });
  socket.on("attempt-cnv-player", () => {
    let timestamp = Date.now();
    let vcnvData = JSON.parse(
      fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath)
    );
    let time = new Date(timestamp);
    vcnvData.disabledPlayers.push(socketIDs.indexOf(socket.id));
    vcnvData.CNVPlayers.push({
      id: socketIDs.indexOf(socket.id),
      timestamp: timestamp,
      readableTime:
        time.getHours() +
        ":" +
        time.getMinutes() +
        ":" +
        time.getSeconds() +
        "." +
        time.getMilliseconds(),
    });
    vcnvData.CNVPlayers.sort(sortByTimestamp);
    fs.writeFileSync(
      JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath,
      JSON.stringify(vcnvData)
    );
    io.emit("update-vcnv-data", vcnvData);
  });
  socket.on("submit-cnv-mark", (vcnvMark) => {
    let vcnvData = JSON.parse(
      fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath)
    );
    for (let i = 0; i < vcnvMark.length; i++) {
      if (vcnvMark[i] != null) {
        if (vcnvMark[i] == true) {
          matchData.players[i].score += vcnvData.questions[5].value;
        } else {
          vcnvData.disabledPlayers.push(i);
        }
      }
    }
    vcnvData.CNVPlayers = [];
    fs.writeFileSync(
      JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath,
      JSON.stringify(vcnvData)
    );
    fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
    io.emit("update-vcnv-data", vcnvData);
    io.emit("update-match-data", matchData);
  });
  socket.on("get-tangtoc-data", (callback) => {
    callback(
      JSON.parse(
        fs.readFileSync(
          JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath
        )
      )
    );
  });
  socket.on("update-tangtoc-data", (data) => {
    fs.writeFileSync(
      JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath,
      JSON.stringify(data)
    );
    io.emit("update-tangtoc-data", data);
  });
  socket.on("player-submit-answer-tangtoc", (answer) => {
    let timestamp = Date.now();
    let tangtocData = JSON.parse(
      fs.readFileSync(
        JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath
      )
    );
    tangtocData.playerAnswers[socketIDs.indexOf(socket.id)].answer = answer;
    tangtocData.playerAnswers[socketIDs.indexOf(socket.id)].timestamp =
      timestamp;
    let time = new Date(timestamp);
    tangtocData.playerAnswers[socketIDs.indexOf(socket.id)].readableTime =
      time.getHours() +
      ":" +
      time.getMinutes() +
      ":" +
      time.getSeconds() +
      "." +
      time.getMilliseconds();
    fs.writeFileSync(
      JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath,
      JSON.stringify(tangtocData)
    );
    io.emit("update-tangtoc-data", tangtocData);
  });
  socket.on("update-timer-start-timestamp", () => {
    let timestamp = Date.now() + 1000;
    let tangtocData = JSON.parse(
      fs.readFileSync(
        JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath
      )
    );
    tangtocData.timerStartTimestamp = timestamp;
    fs.writeFileSync(
      JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath,
      JSON.stringify(tangtocData)
    );
    io.emit("update-tangtoc-data", tangtocData);
  });
  socket.on("submit-mark-tangtoc-admin", () => {
    let tangtocData = JSON.parse(
      fs.readFileSync(
        JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath
      )
    );
    let markCounter = 4;
    let markData = tangtocData.playerAnswers.sort(sortByTimestamp);
    for (let i = 0; i <= 3; i++) {
      if (markData[i].correct == true) {
        matchData.players[markData[i].id - 1].score += markCounter * 10;
        markCounter--;
      }
    }
    io.emit("update-match-data", matchData);
    fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
  });
  socket.on("toggle-results-display-tangtoc", () => {
    let tangtocData = JSON.parse(
      fs.readFileSync(
        JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath
      )
    );
    tangtocData.showResults = !tangtocData.showResults;
    fs.writeFileSync(
      JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath,
      JSON.stringify(tangtocData)
    );
    io.emit("update-tangtoc-data", tangtocData);
  });
  socket.on("broadcast-tt-question", (id) => {
    if (id != -1) {
      let tangtocData = JSON.parse(
        fs.readFileSync(
          JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath
        )
      );
      io.emit("update-tangtoc-question", tangtocData.questions[id - 1]);
    } else {
      io.emit("update-tangtoc-question", undefined);
    }
  });
  socket.on("clear-answer-tt", () => {
    let tangtocData = JSON.parse(
      fs.readFileSync(
        JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath
      )
    );
    let resetedData = [
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
      {
        id: 4,
        answer: "",
        timestamp: 0,
        readableTime: "",
        correct: false,
      },
    ];
    if (tangtocData.playerAnswers != resetedData) {
      tangtocData.playerAnswers = resetedData;
    }
    fs.writeFileSync(
      JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath,
      JSON.stringify(tangtocData)
    );
    io.emit("update-tangtoc-data", tangtocData);
  });
  socket.on("tangtoc-play-video", () => {
    io.emit("tangtoc-play-video");
  });
  socket.on("get-vedich-data", (callback) => {
    callback(
      JSON.parse(
        fs.readFileSync(
          JSON.parse(fs.readFileSync(matchDataPath)).VedichFilePath
        )
      )
    );
  });
  socket.on("update-vedich-data", (data) => {
    fs.writeFileSync(
      JSON.parse(fs.readFileSync(matchDataPath)).VedichFilePath,
      JSON.stringify(data)
    );
    io.emit("update-vedich-data", data);
  });
  var currentVdQuestion = {};
  socket.on("broadcast-vd-question", (id) => {
    if (id != -1) {
      let vedichData = JSON.parse(
        fs.readFileSync(
          JSON.parse(fs.readFileSync(matchDataPath)).VedichFilePath
        )
      );
      io.emit(
        "update-vedich-question",
        vedichData.questionPools[vedichData.currentPlayerId - 1][id]
      );
      currentVdQuestion =
        vedichData.questionPools[vedichData.currentPlayerId - 1][id];
    } else {
      io.emit("update-vedich-question", undefined);
      currentVdQuestion = {};
      let vedichData = JSON.parse(
        fs.readFileSync(
          JSON.parse(fs.readFileSync(matchDataPath)).VedichFilePath
        )
      );
      if (vedichData.ifNSHV == true) {
        vedichData.ifNSHV = false;
        fs.writeFileSync(
          JSON.parse(fs.readFileSync(matchDataPath)).VedichFilePath,
          JSON.stringify(vedichData)
        );
        io.emit("update-vedich-data", vedichData);
      }
    }
  });
  socket.on("mark-correct-vd", (id, value) => {
    console.log("Chấm cho ts: " + id);
    let vedichData = JSON.parse(
      fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VedichFilePath)
    );
    if (vedichData.ifNSHV == true && lastStealingPlayerId == -1) {
      console.log("Chấm điểm nshv cho thí sinh + " + id);
      matchData.players[id - 1].score += value * 2;
      vedichData.ifNSHV = false;
    } else {
      if (lastStealingPlayerId != -1) {
        console.log("Chấm điểm đúng thí sinh cướp câu hỏi " + id);
        matchData.players[id - 1].score += value;
        if (!vedichData.ifNSHV)
          matchData.players[vedichData.currentPlayerId - 1].score -= value;
      } else {
        console.log("Chấm điểm đúng thí sinh " + id);
        matchData.players[id - 1].score += value;
      }
    }
    vedichData.ifNSHV = false;
    lastStealingPlayerId = -1;
    fs.writeFileSync(
      JSON.parse(fs.readFileSync(matchDataPath)).VedichFilePath,
      JSON.stringify(vedichData)
    );
    fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
    io.emit("update-vedich-data", vedichData);
    io.emit("update-match-data", matchData);
    io.emit("clear-stealing-player");
  });
  socket.on("mark-incorrect-vd", (id, value) => {
    console.log("Chấm sai cho thí sinh " + id);
    matchData.players[id - 1].score -= value / 2;
    lastStealingPlayerId = -1;
    let vedichData = JSON.parse(
      fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VedichFilePath)
    );
    vedichData.ifNSHV = false;
    fs.writeFileSync(
      JSON.parse(fs.readFileSync(matchDataPath)).VedichFilePath,
      JSON.stringify(vedichData)
    );
    io.emit("update-vedich-data", vedichData);
    io.emit("update-match-data", matchData);
    io.emit("clear-stealing-player");
  });
  socket.on("player-steal-question", () => {
    if (lastStealingPlayerId == -1) {
      console.log("Cướp câu hỏi");
      io.emit("lock-button-vd");
      lastStealingPlayerId = socketIDs.indexOf(socket.id);
      ifFiveSecActive = false;
      io.emit("player-steal-question", socketIDs.indexOf(socket.id));
    }
  });
  socket.on("vd-play-video", () => {
    io.emit("vd-play-video");
  });
  socket.on("start-5s-countdown-vd", () => {
    let counter = 50;
    ifFiveSecActive = true;
    io.emit("unlock-button-vd");
    let vdData = JSON.parse(
      fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VedichFilePath)
    );
    if (vdData.ifNSHV == true) {
      matchData.players[vdData.currentPlayerId - 1].score -=
        currentVdQuestion.value;
      fs.writeFileSync(
        JSON.parse(fs.readFileSync(matchDataPath)).VedichFilePath,
        JSON.stringify(vdData)
      );
      fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
      io.emit("update-vedich-data", vdData);
      io.emit("update-match-data", matchData);
    }
    io.emit("update-5s-countdown-vd", counter);
    let interval = setInterval(() => {
      counter--;
      io.emit("update-5s-countdown-vd", counter);
      if (counter == 0) {
        clearInterval(interval);
        counter = 0;
        io.emit("update-5s-countdown-vd", counter);
        io.emit("lock-button-vd");
        ifFiveSecActive = false;
      } else if (ifFiveSecActive == false) {
        clearInterval(interval);
        counter = 0;
        io.emit("update-5s-countdown-vd", counter);
        io.emit("lock-button-vd");
        ifFiveSecActive = false;
      }
    }, 100);
  });
  socket.on("play-sfx", (sfx, loop) => {
    io.emit("play-sfx", sfx, loop);
  });
  socket.on("get-chp-data", (callback) => {
    callback(
      JSON.parse(
        fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).ChpFilePath)
      )
    );
  });
  socket.on("update-chp-data", (data) => {
    fs.writeFileSync(
      JSON.parse(fs.readFileSync(matchDataPath)).ChpFilePath,
      JSON.stringify(data)
    );
    io.emit("update-chp-data", data);
  });
  socket.on("broadcast-chp-question", (id) => {
    chpData = JSON.parse(
      fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).ChpFilePath)
    );
    io.emit("update-chp-question", chpData.questions[id]);
    playedChp = [false, false, false, false];
  });
  socket.on("start-timer-chp", () => {
    doTimer(15);
    io.emit("unlock-button-chp");
  });
  socket.on("get-turn-chp", () => {
    if (chpTurnId == -1 && playedChp[socketIDs.indexOf(socket.id)] == false) {
      chpTurnId = socketIDs.indexOf(socket.id);
      chpLastTurnSocketId = socket.id;
      io.emit("lock-button-chp");
      io.emit("got-turn-chp", chpTurnId);
      playPauseTime();
    }
  });
  socket.on("mark-correct-chp", () => {
    io.emit("play-sfx", "VD_CORRECT");
    matchData.players[chpTurnId].score += 1;
    io.emit("update-match-data", matchData);
    chpTurnId = -1;
    fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
    io.emit("clear-turn-chp");
  });
  socket.on("mark-wrong-chp", () => {
    playPauseTime();
    io.emit("play-sfx", "VD_WRONG");
    io.emit("unlock-button-chp");
    io.to(chpLastTurnSocketId).emit("unlock-button-chp");
    playedChp[chpTurnId] = true;
    chpTurnId = -1;
    chpLastTurnSocketId = "";
    io.emit("clear-turn-chp");
  });
  socket.on("clear-question-chp", () => {
    io.emit("update-chp-question", {});
  });
});
