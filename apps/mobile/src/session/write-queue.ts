/** Secure-store operations may finish out of order. Keep each key's writes in request order. */
const pending = new Map<string, Promise<void>>();

export function orderedWrite(key: string, action: () => Promise<void>): Promise<void> {
  const next = (pending.get(key) ?? Promise.resolve()).catch(() => undefined).then(action);
  pending.set(key, next);
  const release = () => {
    if (pending.get(key) === next) pending.delete(key);
  };
  void next.then(release, release);
  return next;
}
