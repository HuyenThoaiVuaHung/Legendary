const fs = require('fs');
const io = require('socket.io')(3000, {
  cors: {
    origin: '*',
  }
});
console.log('Server khởi động thành công, đang chờ kết nối mới..');
// Nhập mã bí mật ở đây
var playerSecrets = [
  "DoiA",
  "DoiB",
  "DoiC",
];
var adminSecret = "BTC";
var mcSecret = "MC"
// Nhập đường dẫn tới file data trận đấu
var matchDataPath = "match_data/123.json";






var socketIDs = ['', '', '', ''];
var adminId = "";
var matchData = JSON.parse(fs.readFileSync(matchDataPath));
var timerActive = false;
var chpTurnId = -1;
var chpLastTurnSocketId = '';
let mainTimer = 0;
var playedChp = [false, false, false, false];
function doTimer(time) {
  timerActive = true;
  mainTimer = time
  io.emit('update-clock', mainTimer);
  let interval = setInterval(() => {
    mainTimer--;
    if (mainTimer <= 0 || timerActive == false) {
      clearInterval(interval);
      io.emit('update-clock', 0);
      io.emit('lock-button-chp');
      io.emit('disable-answer-button-kd');
      this.threeSecTimerType = 'N';
    }
    else {
      io.emit('update-clock', mainTimer);
    }
  }, 1000)
}
function playPauseTime() {
  if (timerActive == true) {
    matchData.pauseTime = mainTimer;
    timerActive = false;
    fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
  }
  else if (matchData.pauseTime != 0 && timerActive == false) {
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

io.on('connection', socket => {
  socket.on('verify-identity', (authID, callback) => {
    if (playerSecrets.includes(authID)) {
      callback({
        roleId: 0
      });
    }
    else if (authID == adminSecret) {
      callback({
        roleId: 1
      });
    }
    else if (authID == mcSecret) {
      callback({
        roleId: 2
      });
    }
    else {
      callback({
        roleId: 3
      });
    }
  })
  socket.on('init-authenticate', (authID, callback) => {
    if (playerSecrets.includes(authID)) {
      // Nguoi choi
      matchData.players[playerSecrets.indexOf(authID)].isReady = true;
      curAuthID = authID;
      socketIDs[playerSecrets.indexOf(authID)] = socket.id;
      fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
      console.log("Player " + matchData.players[playerSecrets.indexOf(authID)].name + " connected at " + socket.id);
      io.emit('update-match-data', matchData);
      callback({
        roleId: 0,
        matchData: matchData,
        player: matchData.players[playerSecrets.indexOf(authID)],
        playerIndex: playerSecrets.indexOf(authID),
      });
    }
    else if (authID == adminSecret) {
      // Admin
      console.log("Admin connected at " + socket.id);
      adminId = socket.id;
      callback({
        roleId: 1,
        matchData: matchData
      })
    }
    else if (authID == mcSecret) {
      // MC
      console.log("MC connected at " + socket.id);
      callback({
        roleId: 2,
        matchData: matchData
      })
    }
    else {
      // Viewer
      console.log('Viewer connected at ' + socket.id);
      callback({
        roleId: 3,
        matchData: matchData,
        player: undefined,
        playerIndex: undefined,
      })
    }
  })
  socket.on('get-match-data', (callback) => {
    if (callback) {
      callback(matchData)
    }
  });
  socket.on('disconnect', () => {
    if (socketIDs.includes(socket.id)) {
      console.log('Player ' + matchData.players[socketIDs.indexOf(socket.id)].name + ' disconnected at ' + socket.id);
      matchData.players[socketIDs.indexOf(socket.id)].isReady = false;
      fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
      io.emit('update-match-data', matchData);
    }
  })
  socket.on('beginMatch', () => {
    matchData.matchPos = 'CHP';
    fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
    socket.broadcast.emit('beginMatch');
  });
  socket.on('change-match-position', (matchPos, authID) => {
    if (socket.id == adminId) {
      matchData.matchPos = matchPos;
      fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
      io.emit('update-match-data', matchData);
    }
    else if(authID){
      if(authID == adminSecret){
        matchData.matchPos = matchPos;
        fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
        io.emit('update-match-data', matchData);
      }
    }
  })
  socket.on('update-data-from-excel', (recievedJSON, callback) => {
    if (socket.id == adminId) {
      let chpData = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).ChpFilePath));
      chpData.questions = [];
      for (let i = 3; i <= 76; i++) {
        if (recievedJSON.kd[i].__EMPTY) { 
          let question = {}
          question.question = recievedJSON.kd[i].__EMPTY;
          if (recievedJSON.kd[i].__EMPTY_1) {
            question.packNo = Number.parseInt(recievedJSON.kd[i].__EMPTY_1);
          }
          if (recievedJSON.kd[i].__EMPTY_2) {
            question.type = 'P'
            question.audioFilePath = recievedJSON.kd[i].__EMPTY_2;
          }
          else if (recievedJSON.kd[i].__EMPTY_3) {
            question.type = 'A'
            question.audioFilePath = recievedJSON.kd[i].__EMPTY_2;
          }
          else {
            question.type = 'N'
          }
          chpData.questions.push(question);
        }
      }
      fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).ChpFilePath, JSON.stringify(chpData));
      io.emit('update-chp-data', chpData);
      console.log('Hoàn thành nhập từ file excel')
    }
  })
  socket.on('start-clock', (time) => {
    timerActive = false;
    matchData.pauseTime = 0;
    io.emit('enable-answer-button-kd');
    fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
    //pause 1s
    setTimeout(() => {
      doTimer(time);
    }, 1000);

  })
  socket.on('play-pause-clock', () => {
    playPauseTime();
  });
  socket.on('edit-player-info', (payload, callback) => {
    if (adminId == socket.id) {
      matchData.players[payload.index] = payload.player;
      fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
      io.emit('update-match-data', matchData);
      callback({
        message: "Success"
      });
    }
  })

  socket.on('play-sfx', (sfx) => {
    io.emit('play-sfx', sfx);
  });
  socket.on('get-chp-data', (callback) => {
    callback(JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).ChpFilePath)));
  })
  socket.on('update-chp-data', (data) => {
    fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).ChpFilePath, JSON.stringify(data));
    io.emit('update-chp-data', data);
  })
  socket.on('broadcast-chp-question', (id) => {
    chpData = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).ChpFilePath));
    io.emit('update-chp-question', chpData.questions[id]);
    playedChp = [false, false, false, false];
  })
  socket.on('unlock-button-chp', () => {
    io.emit('unlock-button-chp');
  });
  socket.on('lock-button-chp', () => {
    io.emit('lock-button-chp');
  });
  socket.on('get-turn-chp', () => {
    if (chpTurnId == -1 && playedChp[socketIDs.indexOf(socket.id)] == false) {
      chpTurnId = socketIDs.indexOf(socket.id);
      chpLastTurnSocketId = socket.id;
      io.emit('lock-button-chp');
      io.emit('got-turn-chp', chpTurnId);
      playPauseTime();
    }
  });
  socket.on('mark-correct-chp', () => {
    io.emit('play-sfx', 'VD_CORRECT');
    matchData.players[chpTurnId].score += 1;
    io.emit('update-match-data', matchData);
    chpTurnId = -1;
    fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
    io.emit('clear-turn-chp');
  })
  socket.on('mark-wrong-chp', () => {
    playPauseTime();
    io.emit('play-sfx', 'VD_WRONG');
    io.emit("unlock-button-chp");
    io.to(chpLastTurnSocketId).emit('unlock-button-chp');
    playedChp[chpTurnId] = true;
    chpTurnId = -1;
    chpLastTurnSocketId = '';
    io.emit('clear-turn-chp');
  });
  socket.on('clear-question-chp', () => {
    io.emit('update-chp-question', {});
  })
});