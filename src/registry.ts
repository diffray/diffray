export interface Identifiable {
  readonly name: string;
}

export class Registry<T extends Identifiable> {
  protected items = new Map<string, T>();

  register(item: T): void {
    this.items.set(item.name, item);
  }

  get(name: string): T | undefined {
    return this.items.get(name);
  }

  list(): T[] {
    return Array.from(this.items.values());
  }

  remove(name: string): void {
    this.items.delete(name);
  }

  clear(): void {
    this.items.clear();
  }

  count(): number {
    return this.items.size;
  }
}
