import pino from "pino";

export type LogLevel = "info" | "warn" | "error";

export interface Logger {
  log: (level: LogLevel, message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
  isVerbose: () => boolean;
}

let globalLogger: Logger | null = null;

export function initLogger(verbose: boolean): Logger {
  globalLogger = createLogger(verbose);
  return globalLogger;
}

export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = createLogger(false);
  }
  return globalLogger;
}

export function createLogger(verbose: boolean): Logger {
  const pinoLogger = verbose
    ? pino({
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      })
    : null;

  function log(level: LogLevel, message: string, data?: unknown) {
    if (verbose && pinoLogger) {
      if (data) {
        pinoLogger[level](data, message);
      } else {
        pinoLogger[level](message);
      }
    }
  }

  return {
    log,
    info: (message: string, data?: unknown) => log("info", message, data),
    warn: (message: string, data?: unknown) => log("warn", message, data),
    error: (message: string, data?: unknown) => log("error", message, data),
    isVerbose: () => verbose,
  };
}
