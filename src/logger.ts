import { appendFile, mkdirSync } from 'fs';
import { join } from 'path';

export enum LogLevel {
  Info = 0,
  Warn = 1,
  Error = 2,
}

const LEVEL_TAGS: Record<LogLevel, string> = {
  [LogLevel.Info]: '\x1b[37m[INFO]\x1b[0m',
  [LogLevel.Warn]: '\x1b[33m[WARN]\x1b[0m',
  [LogLevel.Error]: '\x1b[31m[ERROR]\x1b[0m',
};

const LOG_DIR = 'logs';

export type LogFn = (message: unknown, level?: LogLevel) => void;

export function createLogger(saveToFile: boolean): LogFn {
  if (saveToFile) mkdirSync(LOG_DIR, { recursive: true });

  return (message: unknown, level: LogLevel = LogLevel.Info): void => {
    const tag = LEVEL_TAGS[level] ?? LEVEL_TAGS[LogLevel.Info];
    const now = new Date();
    const stamp =
      `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}` +
      ` @ ${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
    console.log(tag, stamp, message);

    if (saveToFile) {
      const fileName = `${now.getDate()}.${now.getMonth() + 1}.${now.getFullYear()}.txt`;
      appendFile(join(LOG_DIR, fileName), `${tag} ${stamp} ${message}\n`, (err) => {
        if (err) console.error('Failed to write log file:', err);
      });
    }
  };
}
