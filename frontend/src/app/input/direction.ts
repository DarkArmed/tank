import type { Direction } from "../sim";

const DIRECTIONS: readonly Direction[] = ["up", "right", "down", "left"];

export class DirectionResolver {
  private sequence = 0;
  private readonly held = new Map<string, { direction: Direction; order: number }>();

  set(source: string, direction: Direction, pressed: boolean): void {
    const previous = this.held.get(source);
    if (!pressed) {
      this.held.delete(source);
      return;
    }
    if (previous === undefined) {
      this.sequence += 1;
      this.held.set(source, { direction, order: this.sequence });
    }
  }

  resolve(): Direction | null {
    let current: { direction: Direction; order: number } | undefined;
    for (const candidate of this.held.values()) {
      if (current === undefined || candidate.order > current.order) {
        current = candidate;
      }
    }
    return current?.direction ?? null;
  }

  clearPrefix(prefix: string): void {
    for (const source of this.held.keys()) {
      if (source.startsWith(prefix)) {
        this.held.delete(source);
      }
    }
  }

  clear(): void {
    this.held.clear();
  }
}

export function setPadDirections(
  resolver: DirectionResolver,
  slot: number,
  directions: Readonly<Record<Direction, boolean>>,
): void {
  for (const direction of DIRECTIONS) {
    resolver.set(`pad${slot}:${direction}`, direction, directions[direction]);
  }
}
