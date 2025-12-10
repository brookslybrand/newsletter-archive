export const cache = {
  TTL_MS: 60 * 60 * 1000,
  get TTL_SECONDS() {
    return this.TTL_MS / 1000;
  },
  STALE_WHILE_REVALIDATE_SECONDS: 86400,
};
