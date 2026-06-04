import { formatTimestamp } from "./export-utils";

export type SegmentFilterMode = "all" | "untranslated";

export type SegmentListItem<T> = {
  segment: T;
  index: number;
};

export type SearchableSegment = {
  start: number;
  end: number;
  sourceText: string;
  translatedText?: string | null;
};

export function filterSegmentItems<T extends SearchableSegment>(
  segments: T[],
  filter: SegmentFilterMode,
  query: string,
): SegmentListItem<T>[] {
  const normalizedQuery = query.trim().toLowerCase();
  return segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment, index }) => {
      if (filter === "untranslated" && typeof segment.translatedText === "string" && segment.translatedText.trim()) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return [
        segment.sourceText,
        segment.translatedText || "",
        formatTimestamp(segment.start),
        formatTimestamp(segment.end),
        String(index + 1),
      ]
        .join("\n")
        .toLowerCase()
        .includes(normalizedQuery);
    });
}

export function getVisibleSegmentItems<T>(items: SegmentListItem<T>[], visibleCount: number) {
  return items.slice(0, visibleCount);
}

export function getJumpTargetIndex(segmentCount: number, value: string) {
  if (!segmentCount) {
    return null;
  }
  const requested = Math.floor(Number(value));
  if (!Number.isFinite(requested)) {
    return null;
  }
  return Math.min(segmentCount - 1, Math.max(0, requested - 1));
}

export function getVisibleCountForJump(currentCount: number, targetIndex: number, pageSize: number) {
  return Math.max(currentCount, targetIndex + 1, pageSize);
}
