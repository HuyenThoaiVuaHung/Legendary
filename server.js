const fs = require('fs');
const io = require('socket.io')(3000, {
  cors: {
    origin: '*',
  }
});
// Nhập mã bí mật ở đây
var playerSecrets = [
  "123",
  "234",
  "345",
  "456",
];
var adminSecret = "BTC";
var mcSecret = "MC"
// Nhập đường dẫn tới file data trận đấu
var matchDataPath = "match_data/123.json";






var socketIDs = ['', '', '', ''];
var adminId = "";
var matchData = JSON.parse(fs.readFileSync(matchDataPath));
var lastTurnId = '';
var timerActive = false;
var ifLastAnswerCorrect = false;
var ifFiveSecActive = false;
var threeSecTimerType = 'N'; // N: No timer, A: Admin, P: Player
function doTimer(time) {
  let counter = time;
  timerActive = true;
  io.emit('update-clock', counter);
  let interval = setInterval(() => {
    counter--;
    if (counter <= 0 || timerActive == false) {
      clearInterval(interval);
      io.emit('update-clock', 0);
    }
    else {
      io.emit('update-clock', counter);
    }
  }, 1000)
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
    callback(matchData);
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
    matchData.matchPos = 'KD';
    fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
    socket.broadcast.emit('beginMatch');
  });
  socket.on('change-match-position', (matchPos) => {
    if (socket.id == adminId) {
      matchData.matchPos = matchPos;
      fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
      io.emit('update-match-data', matchData);
    }

  })
  socket.on('start-clock', (time) => {
    timerActive = false;
    matchData.pauseTime = 0;
    fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
    //pause 1s
    setTimeout(() => {
      doTimer(time);
    }, 1000);

  })
  socket.on('play-pause-clock', (time) => {
    if (matchData.pauseTime == 0 && timerActive == true) {
      timerActive = false;
      matchData.pauseTime = time;
      fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
    }
    else if (matchData.pauseTime != 0 && timerActive == false) {
      doTimer(matchData.pauseTime);
      matchData.pauseTime = 0;
      fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
    }
  });
  socket.on('get-kd-data-admin', (callback) => {
    if (adminId == socket.id) {
      callback(JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath)));
    }
    // Will implement encryption later
    //var kd_questions=JSON.parse(cryptoJS.AES.decrypt(fs.readFileSync(`question_data/kd_questions.json`), questionsPassword ));
  });
  socket.on('add-kd-question', (payload, callback) => {
    if (adminId == socket.id) {
      var kd_data = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath));
      kd_data.questions.push(payload);
      fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath, JSON.stringify(kd_data));
      socket.emit('update-kd-data-admin', kd_data)
    }
  })
  socket.on('edit-kd-question', (payload, callback) => {
    if (adminId == socket.id) {
      var kd_data = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath));
      kd_data.questions[payload.index] = payload.question;
      fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath, JSON.stringify(kd_data));
      socket.emit('update-kd-data-admin', kd_data);
      callback({
        message: "Success"
      });
    }
  })
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
  socket.on('remove-kd-question', (index, callback) => {
    if (adminId == socket.id) {
      var kd_data = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath));
      kd_data.questions.splice(index, 1);
      fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath, JSON.stringify(kd_data));
      socket.emit('update-kd-data-admin', kd_data);
      callback({
        message: "Success"
      });
    }
  })
  socket.on('broadcast-kd-question', (questionId, callback) => {
    socket.broadcast.emit('update-kd-question', JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath)).questions[questionId]);
    callback({
      message: '200 OK'
    });
  })
  socket.on('clear-question-kd', () => {
    socket.broadcast.emit('update-kd-question', '');
  })
  socket.on('get-turn-kd', () => {
    lastTurnId = socket.id;
    io.emit('disable-answer-button-kd', (callback) => {
      if (lastTurnId == socket.id) {
        callback('Success');
      }
    });
    io.emit('player-got-turn-kd', matchData.players[socketIDs.indexOf(socket.id)]);
  })
  socket.on('clear-turn-kd', () => {
    io.emit('clear-turn-player-kd');
  })
  socket.on('correct-mark-kd', () => {
    ifLastAnswerCorrect = true;
    io.emit('enable-answer-button-kd');
    matchData.players[socketIDs.indexOf(lastTurnId)].score += 10;
    fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
    io.emit('update-match-data', matchData);
    io.to(lastTurnId).emit('update-player-score', matchData.players[socketIDs.indexOf(lastTurnId)].score);
    threeSecTimerType = 'N';
  })
  socket.on('wrong-mark-kd', (ifPlayer) => {
    ifLastAnswerCorrect = false;
    io.emit('enable-answer-button-kd');
    if (ifPlayer == true) {
      io.to(lastTurnId).emit('disable-answer-button-kd', true);
    }
    threeSecTimerType = 'N';
  })
  socket.on('start-3s-timer-kd', (ifPlayer) => {
    if (ifPlayer) {
      threeSecTimerType = 'P';
      let counter = 30;
      io.emit('update-3s-timer-kd', 30, true);
      var interval = setInterval(() => {
        counter--;
        io.emit('update-3s-timer-kd', counter, true);
        if (threeSecTimerType == 'N') {
          clearInterval(interval);
          io.emit('enable-answer-button-kd');
          if (ifLastAnswerCorrect == false) {
            io.emit('disable-answer-button-kd');
            ifLastAnswerCorrect = null;
          }
          io.emit('clear-turn-player-kd');
          io.emit('update-3s-timer-kd', 0, true)
          io.emit('update-3s-timer-kd', 0, false)

        }
        else if (counter == 0) {
          clearInterval(interval);
          io.emit('enable-answer-button-kd');
          if (threeSecTimerType == 'P') {
            io.to(lastTurnId).emit('disable-answer-button-kd');
            threeSecTimerType = 'N';
            io.emit('play-sfx', 'KD_WRONG');
          }
          io.emit('clear-turn-player-kd');
          io.emit('next-question');
        }
      }, 100);
    }
    else {
      let counter = 30;
      threeSecTimerType = 'A';
      io.emit('update-3s-timer-kd', 30, false);
      var interval = setInterval(() => {
        counter--;
        io.emit('update-3s-timer-kd', counter, false);
        if (counter == 0) {
          io.emit('next-question');
          io.emit('enable-answer-button-kd');
          io.emit('clear-turn-player-kd');
          io.emit('play-sfx', 'KD_WRONG');
          clearInterval(interval);
        }
        else if (threeSecTimerType != 'A') {
          clearInterval(interval);
          io.emit('update-3s-timer-kd', 0, false)
          io.emit('clear-turn-player-kd');
        }
      }, 100);
    }
  });
  socket.on('stop-3s-timer-kd', () => {
    threeSecTimerType = 'N';
  });
  socket.on('get-vcnv-data', (callback) => {
    callback(JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath)));
  })
  socket.on('mark-answer-vcnv', (payload) => {
    for (let i = 0; i <= payload.length; i++) {
      if (payload[i] == true) {
        matchData.players[i].score += 10;
      }
      io.emit('update-match-data', matchData);
    }
  })
  socket.on('update-vcnv-data', (payload) => {
    let payloadData = payload;
    switch (payloadData.noOfOpenRows) {
      case 0: payloadData.questions[5].value = 80;
        break;
      case 1: payloadData.questions[5].value = 80;
        break;
      case 2: payloadData.questions[5].value = 60;
        break;
      case 3: payloadData.questions[5].value = 40;
        break;
      case 4: payloadData.questions[5].value = 20;
        break;
      case 5: payloadData.questions[5].value = 10;
        break;
    }
    fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath, JSON.stringify(payloadData));
    io.emit('update-vcnv-data', payloadData);
  })
  socket.on('broadcast-vcnv-question', (questionId) => {
    io.emit('update-vcnv-question', JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath)).questions[questionId - 1]);
    let vcnvData = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath));
    vcnvData.noOfOpenRows++;
    switch (vcnvData.noOfOpenRows) {
      case 0: vcnvData.questions[5].value = 80;
        break;
      case 1: vcnvData.questions[5].value = 80;
        break;
      case 2: vcnvData.questions[5].value = 60;
        break;
      case 3: vcnvData.questions[5].value = 40;
        break;
      case 4: vcnvData.questions[5].value = 20;
        break;
      case 5: vcnvData.questions[5].value = 10;
        break;
    }
    fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath, JSON.stringify(vcnvData));
    io.emit('update-vcnv-data', vcnvData);

  })
  socket.on('highlight-vcnv-question', (questionId) => {
    io.emit('update-highlighted-vcnv-question', questionId);
  })
  socket.on('submit-answer-vcnv', (answer) => {
    let vcnvData = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath));
    vcnvData.playerAnswers[socketIDs.indexOf(socket.id)].answer = answer;
    fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath, JSON.stringify(vcnvData));
    io.emit('update-vcnv-data', vcnvData);
  })
  socket.on('open-hn-vcnv', (id) => {
    let vcnvData = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath));
    vcnvData.questions[id - 1].ifOpen = true;
    fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath, JSON.stringify(vcnvData));
    fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath, JSON.stringify(vcnvData));
    io.emit('update-vcnv-data', vcnvData);
  })
  socket.on('close-hn-vcnv', (id) => {
    let vcnvData = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath));
    vcnvData.questions[id - 1].ifOpen = false;
    fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath, JSON.stringify(vcnvData));
    let openedHN = 0;
    for (let i = 0; i < vcnvData.questions.length; i++) {
      if (vcnvData.questions[i].ifOpen == true) {
        openedHN++;
      }
    }
    switch (openedHN) {
      case 0: vcnvData.questions[5].value = 80;
        break;
      case 1: vcnvData.questions[5].value = 80;
        break;
      case 2: vcnvData.questions[5].value = 60;
        break;
      case 3: vcnvData.questions[5].value = 40;
        break;
      case 4: vcnvData.questions[5].value = 20;
        break;
      case 5: vcnvData.questions[5].value = 10;
        break;
    }
    fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath, JSON.stringify(vcnvData));
    io.emit('update-vcnv-data', vcnvData);
  })
  socket.on('clear-player-answer', () => {
    //read vcnvFile
    let vcnvData = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath));
    vcnvData.playerAnswers[socketIDs.indexOf(socket.id)].answer = '';
    vcnvData.playerAnswers[socketIDs.indexOf(socket.id)].correct = false;
    fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath, JSON.stringify(vcnvData));
    io.emit('update-vcnv-data', vcnvData);
  });
  socket.on('submit-mark-vcnv-admin', (payload) => {
    let vcnvData = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath));
    vcnvData.playerAnswers = payload;
    for (let i = 0; i <= 3; i++) {
      if (payload[i].correct == true) {
        matchData.players[i].score += 10;
      }
    }
    io.emit('update-match-data', matchData);
    fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath, JSON.stringify(vcnvData));
    fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
  })
  socket.on('toggle-results-display-vcnv', () => {
    let vcnvData = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath));
    vcnvData.showResults = !vcnvData.showResults;
    fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath, JSON.stringify(vcnvData));
    io.emit('update-vcnv-data', vcnvData);
  })
  socket.on('attempt-cnv-player', (timestamp) => {
    let vcnvData = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath));
    let time = new Date(timestamp);
    vcnvData.CNVPlayers.push({
      id: socketIDs.indexOf(socket.id),
      timestamp: timestamp,
      readableTime: time.getHours() + ':' + time.getMinutes() + ':' + time.getSeconds() + '.' + time.getMilliseconds()
    })
    vcnvData.CNVPlayers.sort(sortByTimestamp);
    fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath, JSON.stringify(vcnvData));
    io.emit('update-vcnv-data', vcnvData);
  })
  socket.on('submit-cnv-mark', (vcnvMark) => {
    let vcnvData = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath));
    for (let i = 0; i < vcnvMark.length; i++) {
      if (vcnvMark[i] != null) {
        if (vcnvMark[i] == true) {
          matchData.players[i].score += vcnvData.questions[5].value;
        }
        else {
          vcnvData.disabledPlayers.push(i);
        }
      }
    }
    vcnvData.CNVPlayers = [];
    fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath, JSON.stringify(vcnvData));
    fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
    io.emit('update-vcnv-data', vcnvData);
    io.emit('update-match-data', matchData);
  })
  socket.on('get-tangtoc-data', (callback) => {
    callback(JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath)));
  });
  socket.on('update-tangtoc-data', (data) => {
    fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath, JSON.stringify(data));
    io.emit('update-tangtoc-data', data);
  })
  socket.on('player-submit-answer-tangtoc', (answer, timestamp) => {
    let tangtocData = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath));
    tangtocData.playerAnswers[socketIDs.indexOf(socket.id)].answer = answer;
    tangtocData.playerAnswers[socketIDs.indexOf(socket.id)].timestamp = timestamp;
    let time = new Date(timestamp);
    tangtocData.playerAnswers[socketIDs.indexOf(socket.id)].readableTime = time.getHours() + ':' + time.getMinutes() + ':' + time.getSeconds() + '.' + time.getMilliseconds();
    fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath, JSON.stringify(tangtocData));
    io.emit('update-tangtoc-data', tangtocData);
  });
  socket.on('update-timer-start-timestamp', (timestamp) => {
    let tangtocData = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath));
    tangtocData.timerStartTimestamp = timestamp;
    fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath, JSON.stringify(tangtocData));
    io.emit('update-tangtoc-data', tangtocData);
  });
  socket.on('submit-mark-tangtoc-admin', () => {
    let tangtocData = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath));
    let markCounter = 4;
    let markData = tangtocData.playerAnswers.sort(sortByTimestamp);
    for (let i = 0; i <= 3; i++) {
      if (markData[i].correct == true) {
        matchData.players[markData[i].id - 1].score += markCounter * 10;
        markCounter--;
      }
    }
    io.emit('update-match-data', matchData);
    fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
  });
  socket.on('toggle-results-display-tangtoc', () => {
    let tangtocData = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath));
    tangtocData.showResults = !tangtocData.showResults;
    fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath, JSON.stringify(tangtocData));
    io.emit('update-tangtoc-data', tangtocData);
  });
  socket.on('broadcast-tt-question', (id) => {
    if (id != -1) {
      let tangtocData = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath));
      io.emit('update-tangtoc-question', tangtocData.questions[id - 1]);
    }
    else {
      io.emit('update-tangtoc-question', undefined);
    }
  });
  socket.on('clear-answer-tt', () => {
    let tangtocData = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath));
    let resetedData = [{
      id: 1,
      answer: '',
      timestamp: 0,
      readableTime: '',
      correct: false
    },
    {
      id: 2,
      answer: '',
      timestamp: 0,
      readableTime: '',
      correct: false
    },
    {
      id: 3,
      answer: '',
      timestamp: 0,
      readableTime: '',
      correct: false
    },
    {
      id: 4,
      answer: '',
      timestamp: 0,
      readableTime: '',
      correct: false
    }]
    if (tangtocData.playerAnswers != resetedData) {
      tangtocData.playerAnswers = resetedData;
    }
    fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath, JSON.stringify(tangtocData));
    io.emit('update-tangtoc-data', tangtocData);
  });
  socket.on('tangtoc-play-video', () => {
    io.emit('tangtoc-play-video');
  })
  socket.on('get-vedich-data', (callback) => {
    callback(JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VedichFilePath)));
  });
  socket.on('update-vedich-data', (data) => {
    fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VedichFilePath, JSON.stringify(data));
    io.emit('update-vedich-data', data);
  });
  var currentVdQuestion = {};
  socket.on('broadcast-vd-question', (id) => {
    if (id != -1) {
      let vedichData = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VedichFilePath));
      io.emit('update-vedich-question', vedichData.questionPools[vedichData.currentPlayerId - 1][id]);
      currentVdQuestion = vedichData.questionPools[vedichData.currentPlayerId - 1][id];
    }
    else {
      io.emit('update-vedich-question', undefined);
      currentVdQuestion = {};
      let vedichData = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VedichFilePath));
      if (vedichData.ifNSHV == true) {
        vedichData.ifNSHV = false;
        fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VedichFilePath, JSON.stringify(vedichData));
        io.emit('update-vedich-data', vedichData);
      }
    }
  });
  socket.on('mark-correct-vd', (id, value) => {
    let vedichData = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VedichFilePath));
    if (vedichData.ifNSHV == true) {
      matchData.players[id - 1].score += value * 2;
      vedichData.ifNSHV = false;
      fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VedichFilePath, JSON.stringify(vedichData));
      io.emit('update-vedich-data', vedichData);
    }
    else {
      matchData.players[id - 1].score += value;
    }
    io.emit('update-match-data', matchData);
    io.emit('clear-stealing-player');
  })
  socket.on('mark-incorrect-vd', (id, value) => {
    matchData.players[id - 1].score -= value / 2;
    io.emit('update-match-data', matchData);
    io.emit('clear-stealing-player');
  })

  socket.on('player-steal-question', () => {
    io.emit('lock-button-vd');
    ifFiveSecActive = false;
    io.emit('player-steal-question', socketIDs.indexOf(socket.id));
  })
  socket.on('vd-play-video', () => {
    io.emit('vd-play-video');
  })
  socket.on('start-5s-countdown-vd', () => {
    let counter = 50;
    ifFiveSecActive = true;
    io.emit('unlock-button-vd');
    let vdData = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VedichFilePath));
    if (vdData.ifNSHV == true) {
      matchData.players[vdData.currentPlayerId - 1].score -= currentVdQuestion.value;
      vdData.ifNSHV = false;
      fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VedichFilePath, JSON.stringify(vdData));
      fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
      io.emit('update-vedich-data', vdData);
      io.emit('update-match-data', matchData);
    }
    io.emit('update-5s-countdown-vd', counter);
    let interval = setInterval(() => {
      counter--;
      io.emit('update-5s-countdown-vd', counter);
      if (counter == 0) {
        clearInterval(interval);
        counter = 0;
        io.emit('update-5s-countdown-vd', counter);
        io.emit('lock-button-vd');
        ifFiveSecActive = false;
      }
      else if (ifFiveSecActive == false) {
        clearInterval(interval);
        counter = 0;
        io.emit('update-5s-countdown-vd', counter);
        io.emit('lock-button-vd');
        ifFiveSecActive = false;
      }
    }, 100);
  })
  socket.on('play-sfx', (sfx) => {
    io.emit('play-sfx', sfx);
  })
});