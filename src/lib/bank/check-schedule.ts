// When the scheduled payment check calls an account (2026-10-23): the cron runs every minute, an
// account is due when its most frequent active event's interval (Event.bankCheckIntervalMin, default
// 30 min) has passed since the account's last Fio call. Fio allows one call per token per 30 s, so 1 min
// is the shortest setting. Pure: the cron route and the self-check use it.
export const DEFAULT_CHECK_INTERVAL_MIN = 30;
export const CHECK_INTERVALS_MIN = [1, 2, 5, 10, 15, 30, 60] as const;

export const intervalOf = (v: number | null | undefined) => (v && (CHECK_INTERVALS_MIN as readonly number[]).includes(v) ? v : DEFAULT_CHECK_INTERVAL_MIN);

/** Due now? 20 s of slack so a minute cron that runs a little early doesn't skip a whole minute. */
export function accountDue(lastCheckedAt: Date | null, eventIntervals: (number | null)[], now: Date): boolean {
  if (!lastCheckedAt) return true;
  const minutes = Math.min(...eventIntervals.map(intervalOf), DEFAULT_CHECK_INTERVAL_MIN * 2);
  return now.getTime() - lastCheckedAt.getTime() >= minutes * 60_000 - 20_000;
}
