/**
 * Simple concurrency limiter (p-limit style)
 */

/**
 * Creates a concurrency limiter
 * @param concurrency - Maximum number of concurrent executions
 */
export function createLimiter(concurrency: number) {
  const queue: Array<() => void> = [];
  let running = 0;

  const next = () => {
    if (running < concurrency && queue.length > 0) {
      const fn = queue.shift();
      if (fn) {
        running++;
        fn();
      }
    }
  };

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      queue.push(async () => {
        try {
          resolve(await fn());
        } catch (error) {
          reject(error);
        } finally {
          running--;
          next();
        }
      });
      next();
    });
  };
}
