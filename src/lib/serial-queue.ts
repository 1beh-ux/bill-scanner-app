// Runs async jobs one after another, in call order (U4, audit 2026-11-05: rapid module toggles must not race).
// A failed job doesn't stop the ones after it; each caller gets its own job's result.
export function serialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(job: () => Promise<T>): Promise<T> => {
    const run = tail.then(job, job);
    tail = run.catch(() => undefined);
    return run;
  };
}
