export type EditableSegment = {
  start: number;
  end: number;
  sourceText: string;
  translatedText?: string | null;
};

export function splitTextAt(textValue: string, preferredIndex?: number) {
  const textLength = textValue.length;
  if (textLength < 2) {
    return null;
  }
  const index =
    typeof preferredIndex === "number" && preferredIndex > 0 && preferredIndex < textLength
      ? preferredIndex
      : Math.max(1, Math.min(textLength - 1, Math.round(textLength / 2)));
  return [textValue.slice(0, index).trimEnd(), textValue.slice(index).trimStart()] as const;
}

export function splitEditableSegment(
  segment: EditableSegment,
  cursors: { sourceCursor?: number; translationCursor?: number } = {},
) {
  const sourceParts = splitTextAt(segment.sourceText, cursors.sourceCursor);
  const translationParts =
    typeof segment.translatedText === "string" ? splitTextAt(segment.translatedText, cursors.translationCursor) : null;
  if (!sourceParts && !translationParts) {
    return null;
  }

  const ratio = sourceParts ? sourceParts[0].length / Math.max(segment.sourceText.length, 1) : 0.5;
  const splitTime = segment.start + Math.max(0.05, Math.min(0.95, ratio)) * Math.max(segment.end - segment.start, 0.1);
  const firstSegment: EditableSegment = {
    ...segment,
    end: splitTime,
    sourceText: sourceParts ? sourceParts[0] : segment.sourceText,
    translatedText: translationParts ? translationParts[0] : segment.translatedText,
  };
  const secondSegment: EditableSegment = {
    ...segment,
    start: splitTime,
    sourceText: sourceParts ? sourceParts[1] : "",
    translatedText: translationParts ? translationParts[1] : segment.translatedText === undefined ? undefined : "",
  };
  return [firstSegment, secondSegment] as const;
}

export function mergeEditableSegments(currentSegment: EditableSegment, nextSegment: EditableSegment) {
  return {
    ...currentSegment,
    end: nextSegment.end,
    sourceText: [currentSegment.sourceText, nextSegment.sourceText].filter(Boolean).join("\n"),
    translatedText:
      currentSegment.translatedText !== undefined || nextSegment.translatedText !== undefined
        ? [currentSegment.translatedText || "", nextSegment.translatedText || ""].filter(Boolean).join("\n")
        : undefined,
  };
}
