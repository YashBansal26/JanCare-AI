// Minimal PDF writer (no dependencies) used for demo lab reports.
// Produces a one-page A4 PDF with Helvetica text lines that pypdf can read back.

const esc = (s) => String(s).replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7E]/g, '?');

export function makeTextPdf(lines) {
  // lines: [{ text, size?, bold?, gap? }]
  let y = 800;
  const ops = ['BT'];
  for (const l of lines) {
    const size = l.size || 11;
    y -= l.gap ?? Math.round(size * 1.7);
    ops.push(`/${l.bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 50 ${y} Tm (${esc(l.text)}) Tj`);
  }
  ops.push('ET');
  const content = ops.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
