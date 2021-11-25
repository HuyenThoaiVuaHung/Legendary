const fs = require('fs')
const io = require('socket.io')(3000, {
  cors: {
    origin: ['http://localhost:4200']
  }
})

var player=[]

io.on('connection', socket => {
  console.log(socket.id);
  socket.on('send-message', message => {
    console.log(message);
  });
  socket.on('init-authenticate', (authId, callback) => {
    console.log(authId);
    if (fs.existsSync(`./users_data/${authId}.json`)) {
      console.log('dfajsiodjfioasdhjfioh');
      var player = JSON.parse(fs.readFileSync(`./users_data/${authId}.json`));
      callback({
        ifValid: true,
        playerInfo: player
      })
    }
    else if(authId="BTC"){
      callback({
        ifValid:true
      })
    }
    else {
      callback({
        ifValid: false
      })
    }
  })
})

/*

io.on('send-message', message => {
  console.log(message);
})
io.on('init-authenticate', (authID,callback) =>{
  if(fs.existsSync(`/users_data/${authID}.json`)){
    var player = JSON.parse(`/users_data/${authID}.json`);
    callback({
      ifValid:true,
      playerInfo: player

    }) 
  }else if(authID="BTC"){
    callback({
      ifValid:true
    })
  }
*/