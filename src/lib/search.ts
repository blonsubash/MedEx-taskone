export function normalizeSearchQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function createSearchScheduler(apply: (query: string) => void, delay = 300) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  function cancel() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }
  return {
    cancel,
    schedule(value: string) {
      cancel();
      timer = setTimeout(() => {
        timer = null;
        apply(normalizeSearchQuery(value));
      }, delay);
    },
    flush(value: string) {
      cancel();
      apply(normalizeSearchQuery(value));
    },
  };
}
