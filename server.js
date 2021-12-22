const cryptoJS = require('crypto-js');
const fs = require('fs');
const io = require('socket.io')(3000, {
  cors: {
    origin: 'http://localhost:4200',
  }
});

var connectedPlayers = [];
var socketIDs = [];
var adminID="";
io.on('connection', socket => {
  socket.on('init-authenticate', (authID,callback) =>{
    if(fs.existsSync(`users_data/${authID}.json`)){
      var player=JSON.parse(fs.readFileSync(`users_data/${authID}.json`));
      callback({
        ifValid:true,
        playerInfo:player,
      })
      connectedPlayers.push(player);
      socketIDs.push(socket.id);
      console.log(socketIDs);
     // console.log('Số người chơi: ', playerCount)
     // console.log("Người chơi số " + playerCount + " là " + player.name);
      socket.to(adminID).emit('update-connected-players', connectedPlayers);
    }else if(authID=="BTC"){
      adminID=socket.id;
      callback({
        ifValid:true,
        connectedPlayers:connectedPlayers
      })
    }
  })
  socket.on('disconnect', () => {
    console.log('disconnect');
    connectedPlayers.splice(connectedPlayers.indexOf(socketIDs[socket.id]), 1);
    socketIDs.splice(socketIDs.indexOf(socket.id), 1);
    console.log(connectedPlayers)
    socket.to(adminID).emit('update-connected-players', connectedPlayers);
  })
  socket.on('beginMatch', () => {
    console.log('Bắt đầu phần khởi động');
    socket.broadcast.emit('beginMatch');
  });

  socket.on('get-kd-questions',(callback)=>{
    callback(JSON.parse(fs.readFileSync(`question_data/kd_questions.json`)));
    // Will implement encryption later
    //var kd_questions=JSON.parse(cryptoJS.AES.decrypt(fs.readFileSync(`question_data/kd_questions.json`), questionsPassword ));
  })
  socket.on('update-question',(type, payload, password, callback)=>{
    switch (type){
      case 'kd':
        // Will implement encryption later
        //fs.writeFileSync(`question_data/kd_questions.json`, cryptoJS.AES.encrypt(JSON.stringify(payload), password));
        fs.writeFileSync(`question_data/kd_questions.json`, JSON.stringify(payload));
        callback({
          message:"200 OK"
        });
        break;
      default:
        console.warn('Chưa thêm tính năng này :)');
    }

  })

  socket.on('broadcast-kd-question', (question, callback)=>{
    socket.broadcast.emit('update-displayed-kd-question', question);
    callback({
      message:'200 OK'
    });
  })
  socket.on('begin-kd-clock', (authID, callback)=>{
    var timeleft=60;
    var timer=setInterval(()=>{
      if (timeleft <= 0){
        clearInterval(timer);
      }
      socket.broadcast.emit('update-kd-time', timeleft);
      timeleft-=1;
    },1000)
    callback({
      message:'200 OK'
    })
  })
  socket.on('update-player-score',(score, authID, callback )=>{
    var player = JSON.parse(fs.readFileSync(`users_data/${authID}.json`));
    var playerScore = player.score;
    playerScore += score; 
    fs.writeFileSync(`users_data/${authID}.json`, JSON.stringify(player));
    callback({
      playerScore : playerScore,
      message:'200 OK'
    });
  })
})

