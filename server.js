const cryptoJS = require('crypto-js');
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
// Nhập đường dẫn tới file data trận đấu
var matchDataPath = "match_data/123.json";







var socketIDs = ['', '', '', ''];
var adminId= "";
var matchData = JSON.parse(fs.readFileSync(matchDataPath));
var lastTurnId = '';
var timerActive = false;
function doTimer(time){
  let counter = time;
  timerActive = true;
  io.emit('update-clock', counter);
  let interval = setInterval(() => {
    counter--;
    if(counter <= 0 || timerActive == false){
      clearInterval(interval);
      io.emit('update-clock', 0);
    }
    else{
      io.emit('update-clock', counter);
    }
  }, 1000)
}

io.on('connection', socket => {
  socket.on('init-authenticate', (authID,callback) =>{
    if(playerSecrets.includes(authID)){
      matchData.players[playerSecrets.indexOf(authID)].isReady = true;
      curAuthID = authID;
      socketIDs[playerSecrets.indexOf(authID)] = socket.id;
      fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
      console.log("Player " + authID + " connected at " + socket.id);
      socket.to(adminId).emit('update-match-data', matchData);
      callback({
        roleId: 0,
        matchData: matchData,
        player: matchData.players[playerSecrets.indexOf(authID)]
      });
    }
    else if (authID == adminSecret){
      adminId = socket.id;
      callback({
        roleId: 1,
        matchData: matchData
      })
    }
    else{
      callback({
        roleId: -1,
        matchData: null
      })
    }
  })
  socket.on('disconnect', () =>{
    if(socketIDs.includes(socket.id)){
      console.log('Disconnect at ' + socket.id);
      matchData.players[socketIDs.indexOf(socket.id)].isReady = false;
      fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
      socket.to(adminId).emit('update-match-data', matchData);
    }
  })
  socket.on('beginMatch', () => {
    console.log('Bắt đầu phần khởi động');
    matchData.matchPos = 'KD';
    fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
    socket.broadcast.emit('beginMatch');
  });
  socket.on('start-clock', (time) => {
    timerActive = false;
    setTimeout(() => {}, 1000);
    doTimer(time);
  })
  socket.on('play-pause-clock', (time) => {
    if(matchData.pauseTime == 0 && timerActive == true){
      console.log('timer paused')
      timerActive = false;
      matchData.pauseTime = time;
      fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
    }
    else if(matchData.pauseTime != 0 && timerActive == false){
      doTimer(matchData.pauseTime);
      matchData.pauseTime = 0;
      fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
    }
  });
  socket.on('get-kd-data-admin',(callback)=>{
    if (adminId == socket.id){
      callback(JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath)));
    }
    // Will implement encryption later
    //var kd_questions=JSON.parse(cryptoJS.AES.decrypt(fs.readFileSync(`question_data/kd_questions.json`), questionsPassword ));
  });
  socket.on('add-kd-question', (payload,callback) => {
    if (adminId == socket.id){
      var kd_data = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath));
      kd_data.questions.push(payload);
      fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath, JSON.stringify(kd_data));
      socket.emit('update-kd-data-admin', kd_data)
    }
  })
  socket.on('edit-kd-question', (payload, callback) => {
    if (adminId == socket.id){
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
    if(adminId == socket.id){
      matchData.players[payload.index] = payload.player;
      fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
      socket.emit('update-match-data', matchData);
      callback({
        message: "Success"
      });
    }
  })
  socket.on('remove-kd-question', (index, callback) => {
    if (adminId == socket.id){
      var kd_data = JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath));
      kd_data.questions.splice(index, 1);
      fs.writeFileSync(JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath, JSON.stringify(kd_data));
      socket.emit('update-kd-data-admin', kd_data);
      callback({
        message: "Success"
      });
    }
  })
  socket.on('broadcast-kd-question', (questionId, callback)=>{
    socket.broadcast.emit('update-kd-question', JSON.parse(fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath)).questions[questionId]);
    callback({
      message:'200 OK'
    });
  })
  socket.on('clear-question-kd', ()=>{
    socket.broadcast.emit('update-kd-question', '');
  })
  if3SecActive = false;
  socket.on('get-turn-kd', () => {
    io.emit('disable-answer-button-kd');
    lastTurnId = socket.id;
    socket.to(adminId).emit('player-got-turn-kd', matchData.players[socketIDs.indexOf(socket.id)]);
  })
  let ifLastAnswerCorrect = false;
  socket.on('correct-mark-kd', () => {
    ifLastAnswerCorrect = true;
    io.emit('enable-answer-button-kd');
    matchData.players[socketIDs.indexOf(lastTurnId)].score += 10;
    fs.writeFileSync(matchDataPath, JSON.stringify(matchData));
    socket.to(adminId).emit('update-match-data', matchData);
    socket.to(lastTurnId).emit('update-player-score', matchData.players[socketIDs.indexOf(lastTurnId)].score);
  })
  socket.on('wrong-mark-kd', (ifPlayer) => {
    ifLastAnswerCorrect = false;
    io.emit('enable-answer-button-kd');
    if(ifPlayer == true){
      socket.to(lastTurnId).emit('disable-answer-button-kd');
    }
  })
  let counter = 3;
  let _ifPlayer = false;

  socket.on('start-3s-timer-kd', (ifPlayer) => {
    _ifPlayer = ifPlayer;
    if (if3SecActive == false){
      counter = 3;
      io.emit('update-3s-timer-kd', counter);
      if3SecActive = true;
      let interval = setInterval(() => {
        counter--;
        io.emit('update-3s-timer-kd', counter);
        if(counter <= 0 && if3SecActive == true){
          clearInterval(interval);
          if3SecActive = false;
          io.emit('enable-answer-button-kd');
          io.to(adminId).emit('next-question');
          if(_ifPlayer == true){
            io.to(lastTurnId).emit('disable-answer-button-kd');
          }
        }
        else if(if3SecActive == false){
          clearInterval(interval);
          io.emit('update-3s-timer-kd', 0);
          io.emit('enable-answer-button-kd');
          if(ifLastAnswerCorrect == false){
            io.to(lastTurnId).emit('disable-answer-button-kd');
          }
        }
      }, 1000)
    }
    else {
      counter = 3;
      io.emit('update-3s-timer-kd', counter);
    }


  });
  socket.on('stop-3s-timer-kd', () => {
    if3SecActive = false;
  })  
})

