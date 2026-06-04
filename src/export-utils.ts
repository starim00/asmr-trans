export type ExportContentMode = "bilingual" | "translation" | "source";

export type ExportSegment = {
  start: number;
  end: number;
  sourceText: string;
  translatedText?: string | null;
};

export type ExportResult = {
  segments: ExportSegment[];
};

type ExportLabels = {
  source: string;
  translation: string;
};

const DEFAULT_LABELS: ExportLabels = {
  source: "\u539f\u6587",
  translation: "\u8bd1\u6587",
};

export function formatTimestamp(seconds: number) {
  const safeSeconds = Math.max(seconds, 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const milliseconds = Math.floor((safeSeconds - Math.floor(safeSeconds)) * 1000);
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${wholeSeconds.toString().padStart(2, "0")}.${milliseconds
    .toString()
    .padStart(3, "0")}`;
}

export function formatSrtTimestamp(seconds: number) {
  return formatTimestamp(seconds).replace(".", ",");
}

export function segmentExportLines(
  segment: ExportSegment,
  mode: ExportContentMode,
  withLabels: boolean,
  labels: ExportLabels = DEFAULT_LABELS,
) {
  const source = segment.sourceText;
  const translation = typeof segment.translatedText === "string" ? segment.translatedText : "";
  if (mode === "source") {
    return [source];
  }
  if (mode === "translation") {
    return [translation.trim() || source];
  }
  if (!translation) {
    return [source];
  }
  return withLabels ? [`${labels.source}\uff1a${source}`, `${labels.translation}\uff1a${translation}`] : [source, translation];
}

export function segmentExportText(
  segment: ExportSegment,
  mode: ExportContentMode,
  withLabels = true,
  labels: ExportLabels = DEFAULT_LABELS,
) {
  return segmentExportLines(segment, mode, withLabels, labels).join("\n");
}

export function buildTxt(
  result: ExportResult | null | undefined,
  mode: ExportContentMode = "bilingual",
  labels: ExportLabels = DEFAULT_LABELS,
) {
  if (!result) return "";
  return result.segments
    .map((segment) => {
      const timeRange = `[${formatTimestamp(segment.start)} - ${formatTimestamp(segment.end)}]`;
      return `${timeRange}\n${segmentExportText(segment, mode, true, labels)}`;
    })
    .join("\n\n");
}

export function buildSrt(
  result: ExportResult | null | undefined,
  mode: ExportContentMode = "bilingual",
  labels: ExportLabels = DEFAULT_LABELS,
) {
  if (!result) return "";
  return result.segments
    .map((segment, index) => {
      const subtitleText = segmentExportText(segment, mode, false, labels);
      return `${index + 1}\n${formatSrtTimestamp(segment.start)} --> ${formatSrtTimestamp(segment.end)}\n${subtitleText}`;
    })
    .join("\n\n");
}
