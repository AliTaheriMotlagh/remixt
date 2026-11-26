/**
 * One JSON-LD document: a list of items becomes `{"@context", "@graph"}`.
 * Readers of the page's structured data (browsers' own scripts, extensions,
 * some crawlers) take each script to be an object with an "@context" and
 * crashed on a bare list ("r['@context'].toLowerCase" on tool pages).
 */
export function jsonLdDocument(data: Record<string, unknown> | Record<string, unknown>[]): Record<string, unknown> {
  if (!Array.isArray(data)) return data["@context"] ? data : { "@context": "https://schema.org", ...data };
  if (data.length === 1) return jsonLdDocument(data[0]);
  // Inside a graph each item takes the document's context.
  const graph = data.map((item) => {
    const rest = { ...item };
    delete rest["@context"];
    return rest;
  });
  return { "@context": "https://schema.org", "@graph": graph };
}
