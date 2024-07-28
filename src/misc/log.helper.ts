

enum Level {
    VERBOSE,
    ERROR
}

export class LogHelper {
    private static level = Level.VERBOSE;

    static setLevel(level: Level) {
        LogHelper.level = level;
    }

    static warn(message: string) {
        if (LogHelper.level <= Level.VERBOSE) {
            console.log(`[VERBOSE] ${message}`);
        }
    }

    static error(message: string) {
        if (LogHelper.level <= Level.ERROR) {
            console.error(`[ERROR] ${message}`);
        }
    }

    static log(message: string) {
        console.log(`[LOG] ${message}`);
    }

}