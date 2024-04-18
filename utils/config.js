const { SHA256 } = require('crypto-js');
const readline = require('readline/promises');
const fs = require('fs');


const startConfiguration = async function () {
    console.clear();
    console.log('\x1b[33m%s\x1b[0m', `
dP                                                  dP                            
88                                                  88                            
88        .d8888b. .d8888b. .d8888b. 88d888b. .d888b88 .d8888b. 88d888b. dP    dP 
88        88ooood8 88'  '88 88ooood8 88'  '88 88'  '88 88'  '88 88'  '88 88    88 
88        88.  ... 88.  .88 88.  ... 88    88 88.  .88 88.  .88 88       88.  .88 
88888888P '88888P' '8888P88 '88888P' dP    dP '88888P8 '88888P8 dP       '8888P88 
                        .88                                                   .88 
                    d8888P                                                d8888P  
`);
    console.log('Welcome to Legendary, please setup your configuration file.');
    console.log("Press ENTER to accept default values.")
    let config = {
        saveLog: false,
        saveLogPath: './logs/',
        port: 80,
        gameName: 'Legendary',
        adminSecret: SHA256('admin').toString(),
        playerSecrets: [
            SHA256('123').toString(),
            SHA256('234').toString(),
            SHA256('345').toString(),
            SHA256('456').toString(),
        ]
    };
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    config.saveLog = (await rl.question('Do you want to save logs? (Y/n):')).toLowerCase() === 'y';
    config.saveLogPath = (await rl.question('Enter log path: (./logs/):')) || './logs/';
    config.port = parseInt(await rl.question('Enter default port: (80):')) || 80;
    config.gameName = (await rl.question('Enter game name: (Legendary):')) || 'Legendary';
    config.adminSecret = SHA256((await rl.question('Enter admin secret: (admin):') || 'admin')).toString();
    for (let i = 0; i < 4; i++) {
        config.playerSecrets[i] = SHA256((await rl.question(`Enter player ${i + 1} secret: (${i + 1}${i + 2}${i + 3}):`) || `${i + 1}${i + 2}${i + 3}`).toString());
    }
    rl.close();
    fs.writeFileSync('../config.json'), JSON.stringify(config, null, 2);
    console.log('\x1b[32m%s\x1b[0m', 'Configuration saved.')
}