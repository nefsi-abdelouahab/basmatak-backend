export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  limit: number;
  total?: number;
}

export interface CursorState {
  /** Reference key for the next page (usually the last document's _id). */
  cursor: string | null;
  limit: number;
}
