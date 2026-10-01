/** Normalize common model formatting noise without changing URLs or prose. */
export function normalizeReply(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/gs, "$1")
    .replace(/__(.*?)__/gs, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(?:[ \t]*[•●▪◦*][ \t]+)+/g, "")
    .replace(/([،,؛;.!؟?])(?:[ \t]*\1)+/g, "$1")
    .replace(/[ \t]+([،,؛:!?؟])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
