export interface Identifiable {
  readonly id: string;
}

export class Registry<T extends Identifiable> {
  protected items = new Map<string, T>();

  register(item: T): void {
    this.items.set(item.id, item);
  }

  get(id: string): T | undefined {
    return this.items.get(id);
  }

  list(): T[] {
    return Array.from(this.items.values());
  }

  remove(id: string): void {
    this.items.delete(id);
  }

  clear(): void {
    this.items.clear();
  }

  count(): number {
    return this.items.size;
  }
}
