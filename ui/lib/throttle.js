// 带尾巴的节流（对话处理完后刷新额度用）。

/**
 * 调用后等 delayMs 再执行；离上次执行不到 gapMs 时等到满 gapMs。等着的时候再调用并进这一次，
 * 所以一连串调用里最后那次之后一定还会执行一次（最后一次用量一定会读到）。
 */
export function trailingThrottle(fn, gapMs, delayMs = 0, now = () => Date.now()) {
  let last = -Infinity;
  let timer = null;
  return () => {
    if (timer) return;
    const wait = Math.max(delayMs, last + gapMs - now());
    timer = setTimeout(() => {
      timer = null;
      last = now();
      fn();
    }, wait);
  };
}
