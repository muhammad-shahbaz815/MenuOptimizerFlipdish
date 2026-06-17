// Every call produces a unique runtime ID so that uploading the same JSON
// file twice never re-uses a previous session's comment keys.
export function freshUploadId(): string {
  return `menu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
