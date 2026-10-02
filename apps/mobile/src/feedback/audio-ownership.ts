/** Serialize local audio configuration with communication startup. Voice claims invalidate queued effects. */
export class AudioOwnership {
  private pending: Promise<void> = Promise.resolve();
  private voices = new Set<symbol>();
  private generation = 0;
  private communicationTail: Promise<void> = Promise.resolve();

  get communicationActive() {
    return this.voices.size > 0;
  }

  cancelEffects() {
    this.generation += 1;
  }

  effect(work: (stillAllowed: () => boolean) => Promise<void>): Promise<void> {
    const generation = this.generation;
    const allowed = () => !this.communicationActive && generation === this.generation;
    const task = this.pending
      .catch(() => undefined)
      .then(async () => {
        if (allowed()) await work(allowed);
      });
    this.pending = task.catch(() => undefined);
    return task;
  }

  async claimCommunication(handoff: () => Promise<void>): Promise<() => void> {
    const token = Symbol("communication");
    const previous = this.communicationTail;
    let finishLease!: () => void;
    const released = new Promise<void>((resolve) => {
      finishLease = resolve;
    });
    this.communicationTail = previous.catch(() => undefined).then(() => released);
    this.voices.add(token);
    this.cancelEffects();
    const task = this.pending
      .catch(() => undefined)
      .then(async () => {
        await previous;
        await handoff();
      });
    this.pending = task.catch(() => undefined);
    try {
      await task;
    } catch (error) {
      this.voices.delete(token);
      finishLease();
      throw error;
    }
    return () => {
      this.voices.delete(token);
      finishLease();
      this.cancelEffects();
    };
  }
}
