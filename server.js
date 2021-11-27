const fs = require('fs');
const { connect } = require('http2');
const io = require('socket.io')(3000, {
  cors: {
    origin: 'http://localhost:4200',
  }
});

var connectedPlayers = [];
var socketIDs = [];
var adminID="";
var playerCount = 0;
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
})

