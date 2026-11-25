import PDFDocument from "pdfkit";

/**
 * Minimal document builder over pdfkit for booklet and paper exports.
 * Uses the built-in Helvetica/Courier fonts (WinAnsi), so text is normalised to
 * characters those fonts can draw.
 */
export type Block =
  | { kind: "title"; text: string }
  | { kind: "subtitle"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "meta"; text: string }
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "rule" }
  | { kind: "pageBreak" };

const INK = "#17161a";
const MUTED = "#74717a";
const CODE_BG = "#f4f2ed";

function clean(s: string) {
  return s
    .replace(/\t/g, "    ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u2022\u00B7]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, "?");
}

export function renderPdf(blocks: Block[], info: { title: string }) {
  const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: info.title, Creator: "Code Junk" }, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  const width = doc.page.width - 112;

  for (const b of blocks) {
    switch (b.kind) {
      case "title":
        doc.font("Helvetica-Bold").fontSize(22).fillColor(INK).text(clean(b.text), { width }).moveDown(0.3);
        break;
      case "subtitle":
        doc.font("Helvetica").fontSize(11).fillColor(MUTED).text(clean(b.text), { width }).moveDown(1);
        break;
      case "heading":
        if (doc.y > doc.page.height - 140) doc.addPage();
        doc.moveDown(0.6).font("Helvetica-Bold").fontSize(14).fillColor(INK).text(clean(b.text), { width }).moveDown(0.3);
        break;
      case "meta":
        doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(clean(b.text), { width }).moveDown(0.4);
        break;
      case "text":
        doc.font("Helvetica").fontSize(10.5).fillColor(INK).text(clean(b.text), { width, lineGap: 2 }).moveDown(0.5);
        break;
      case "code": {
        const lines = clean(b.text).replace(/\n+$/, "").split("\n");
        doc.font("Courier").fontSize(8.5);
        const lineH = doc.currentLineHeight(true) + 1;
        let i = 0;
        while (i < lines.length) {
          if (doc.y > doc.page.height - 80) doc.addPage();
          const room = Math.max(1, Math.floor((doc.page.height - 72 - doc.y - 12) / lineH));
          const chunk = lines.slice(i, i + room);
          const top = doc.y;
          // Long lines wrap, so measure the chunk's real height before drawing the background.
          const h = doc.heightOfString(chunk.join("\n"), { width: width - 16, lineGap: 1 }) + 12;
          doc.save().rect(56, top, width, h).fill(CODE_BG).restore();
          doc.fillColor(INK).text(chunk.join("\n"), 64, top + 6, { width: width - 16, lineGap: 1 });
          doc.x = 56;
          doc.y = top + h + 4;
          i += chunk.length;
        }
        doc.moveDown(0.6);
        break;
      }
      case "rule":
        doc.moveDown(0.4).save().moveTo(56, doc.y).lineTo(56 + width, doc.y).lineWidth(0.5).strokeColor("#d3cec4").stroke().restore();
        doc.moveDown(0.8);
        break;
      case "pageBreak":
        doc.addPage();
        break;
    }
  }

  const range = doc.bufferedPageRange();
  for (let p = 0; p < range.count; p++) {
    doc.switchToPage(p);
    doc.font("Helvetica").fontSize(8).fillColor(MUTED);
    doc.text(`${clean(info.title)}  -  ${p + 1} / ${range.count}`, 56, doc.page.height - 40, { width, align: "center", lineBreak: false });
  }
  doc.end();
  return done;
}

/** RFC 6266 Content-Disposition with an ASCII fallback and a UTF-8 name. */
export function attachment(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function safeFileName(s: string, fallback = "file") {
  return (
    s
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || fallback
  );
}
