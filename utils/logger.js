/**
 * Logs a message with the specified type.
 * @param {string} message - The message to be logged.
 * @param {number} [type=0] - The type of the log. 0 for info, 1 for warn, 2 for error.
 */
let config = require("../config.json");
const log = (message, type = 0) => {
  let logType;
  switch (type) {
    case 0:
      logType = "\x1b[37m[INFO]\x1b[0m"; // White
      break;
    case 1:
      logType = "\x1b[33m[WARN]\x1b[0m"; // Yellow
      break;
    case 2:
      logType = "\x1b[31m[ERROR]\x1b[0m"; // Red
      break;
    default:
      logType = "\x1b[37m[INFO]\x1b[0m"; // White
      break;
  }
  let date = new Date();
  console.log(
    logType,
    date.getDate() +
      "/" +
      (date.getMonth() + 1) +
      "/" +
      date.getFullYear() +
      " @ " +
      date.getHours() +
      ":" +
      date.getMinutes() +
      ":" +
      date.getSeconds(),
    message
  );
  if (config.saveLog) {
    let fs = require("fs");
    fs.appendFile(
      `./logs/${
        date.getDate() + "." + (date.getMonth() + 1) + "." + date.getFullYear()
      }.txt`,
      logType +
        " " +
        date.getDate() +
        "/" +
        (date.getMonth() + 1) +
        "/" +
        date.getFullYear() +
        " @ " +
        date.getHours() +
        ":" +
        date.getMinutes() +
        ":" +
        date.getSeconds() +
        " " +
        message +
        "\n",
      function (err) {
        if (err) throw err;
      }
    );
  }
};
module.exports = { log };
