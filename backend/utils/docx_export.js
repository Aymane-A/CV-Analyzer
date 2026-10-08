// Plain text -> .docx (patch 6). Handles Arabic / RTL lines.
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

const RTL_RE = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const isRtl = (s) => RTL_RE.test(s);

function toParagraphs(text) {
  return String(text).replace(/\r\n?/g, '\n').split('\n').map((line) => {
    const rtl = isRtl(line);
    return new Paragraph({
      bidirectional: rtl,
      spacing: { after: 100 },
      children: [new TextRun({ text: line, rightToLeft: rtl, font: 'Calibri', size: 22 })]
    });
  });
}

async function buildDocx(title, text) {
  const children = [];
  if (title) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      bidirectional: isRtl(title),
      spacing: { after: 200 },
      children: [new TextRun({ text: title, rightToLeft: isRtl(title), bold: true, font: 'Calibri', size: 32 })]
    }));
  }
  children.push(...toParagraphs(text));
  const doc = new Document({
    creator: 'CVision',
    title: title || 'CVision',
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } }, children }]
  });
  return Packer.toBuffer(doc);
}

module.exports = { buildDocx };
