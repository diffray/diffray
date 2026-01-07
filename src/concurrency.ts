/**
 * Simple concurrency limiter (p-limit style)
 */

type LimitFunction = <T>(fn: () => Promise<T>) => Promise<T>;

/**
 * Creates a concurrency limiter that allows only N concurrent promises
 * Similar to p-limit but without external dependency
 */
export function createLimiter(concurrency: number): LimitFunction {
  const queue: (() => void)[] = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      const run = queue.shift();
      run?.();
    }
  };

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      const run = async () => {
        activeCount++;
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          next();
        }
      };

      if (activeCount < concurrency) {
        run();
      } else {
        queue.push(run);
      }
    });
  };
}
