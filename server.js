const fs = require('fs');
const { connect } = require('http2');
const io = require('socket.io')(3000)

var connectedPlayers=[];
var adminID="";

io.on('connection', socket => {
  console.log(socket.id);
  socket.on('init-authenticate', (authID,callback) =>{
    if(fs.existsSync(`users_data/${authID}.json`)){
      var player=JSON.parse(`users_data/${authID}.json`);
      callback({
        ifValid:true,
        playerInfo:player
      })
      connectedPlayers.push(authID);
      socket.to(adminID).emit('update-connected-players', connectedPlayers);
    }else if(authID=="BTC"){
      adminID=socket.id;
      callback({
        ifValid:true,
        _connectedPlayers:connectedPlayers
      })
    }
  })

})

