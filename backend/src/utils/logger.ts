type LogMeta = Record<string, unknown>;

function stringifyMeta(meta?: LogMeta): string {
  return meta ? ` ${JSON.stringify(meta)}` : '';
}

export const logger = {
  info(message: string, meta?: LogMeta) {
    console.log(`[INFO] ${message}${stringifyMeta(meta)}`);
  },
  warn(message: string, meta?: LogMeta) {
    console.warn(`[WARN] ${message}${stringifyMeta(meta)}`);
  },
  error(message: string, meta?: LogMeta) {
    console.error(`[ERROR] ${message}${stringifyMeta(meta)}`);
  },
};
