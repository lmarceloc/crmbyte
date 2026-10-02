// Assinatura HTML do vendedor: sanitizada por allowlist; prévia só em
// <iframe sandbox=""> (nunca dangerouslySetInnerHTML).
import sanitizeHtml from "sanitize-html";

export const ASSINATURA_MAX = 20_000;

const ATTR_COMUM = ["style", "align"];

export function sanitizarAssinatura(html: string): string {
  return sanitizeHtml(html.slice(0, ASSINATURA_MAX * 2), {
    allowedTags: [
      "a", "b", "strong", "i", "em", "u", "s", "small", "br", "p", "div", "span", "hr", "img",
      "table", "thead", "tbody", "tr", "td", "th", "ul", "ol", "li",
      "h1", "h2", "h3", "h4", "font", "center", "blockquote",
    ],
    allowedAttributes: {
      a: ["href", "name", "title", "target", "rel", ...ATTR_COMUM],
      img: ["src", "alt", "width", "height", "title", ...ATTR_COMUM],
      table: ["width", "cellpadding", "cellspacing", "border", ...ATTR_COMUM],
      td: ["colspan", "rowspan", "width", "valign", ...ATTR_COMUM],
      th: ["colspan", "rowspan", "width", "valign", ...ATTR_COMUM],
      font: ["color", "size", "face"],
      "*": ATTR_COMUM,
    },
    allowedSchemes: ["https", "http", "mailto", "tel"],
    allowedSchemesByTag: { img: ["https"] },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" },
      }),
    },
  });
}

export function assinaturaEmTexto(html: string): string {
  const texto = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-4]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&"); // &amp; por último, p/ não decodificar duas vezes
  return texto.replace(/\n{3,}/g, "\n\n").trim();
}
