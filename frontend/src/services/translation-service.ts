type TranslateTask = () => Promise<void>;

class TranslationManager {
  #tasks = new Map<string, TranslateTask>();

  register(id: string, task: TranslateTask) {
    this.#tasks.set(id, task);
  }

  unregister(id: string) {
    this.#tasks.delete(id);
  }

  async translateAllPending() {
    const tasks = Array.from(this.#tasks.values());
    await Promise.all(tasks.map((task) => task()));
  }
}

export const translationManager = new TranslationManager();
