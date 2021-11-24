const fs = require('fs')
const io = require('socket.io')(3000)

var player=[]

io.on('connection', socket => {
  console.log(socket.id);
  socket.broadcast.emit(socket.id,"Connected"); //?
})

io.on('connect',{})
io.on('init-authenticate', (authID,callback) =>{
  if(fs.existsSync(`users_data/${authID}.json`)){
    var player=JSON.parse(`users_data/${authID}.json`);
    callback({
      ifValid:true,
      playerInfo:player

    }) 
  }else if(authID="BTC"){
    callback({
      ifValid:true
    })
  }
})

