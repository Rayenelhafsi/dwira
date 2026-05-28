const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

(async () => {
  const outDir = path.join(process.cwd(), 'server', 'contracts');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'sample-contract-with-stamp.pdf');

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const color = rgb(0, 0, 0);

  let y = 800;
  const draw = (text, size = 11, bold = false, gap = 16, x = 40) => {
    page.drawText(String(text), { x, y, size, font: bold ? fontBold : fontRegular, color });
    y -= gap;
  };

  draw('CONTRAT DE LOCATION SAISONNIERE', 16, true, 28, 130);
  draw('Exemple visuel de signature et cachet', 11, false, 24, 180);
  draw('... (contenu du contrat) ...', 11, false, 20, 40);

  const signY = 210;
  const leftX = 40;
  const rightX = 320;

  page.drawText('Signature du Locataire', { x: leftX, y: signY, size: 11, font: fontBold, color });
  page.drawText('(precedee de la mention "Lu et approuve")', { x: leftX, y: signY - 14, size: 10, font: fontRegular, color });

  const stampPath = path.join(process.cwd(), 'server', 'assets', 'cachet.jpg');
  if (fs.existsSync(stampPath)) {
    const stampBytes = fs.readFileSync(stampPath);
    const stampImg = await pdfDoc.embedJpg(stampBytes);
    const stampWidth = 150;
    const stampHeight = (stampImg.height / stampImg.width) * stampWidth;
    page.drawImage(stampImg, {
      x: leftX,
      y: signY - 14 - stampHeight - 10,
      width: stampWidth,
      height: stampHeight,
    });
  }

  page.drawText('Signature du Bailleur', { x: rightX, y: signY, size: 11, font: fontBold, color });
  page.drawText('(precedee de la mention "Lu et approuve")', { x: rightX, y: signY - 14, size: 10, font: fontRegular, color });
  page.drawText('Hafsi Ghaith, Responsable commercial', { x: rightX, y: signY - 36, size: 10, font: fontRegular, color });

  const bytes = await pdfDoc.save();
  fs.writeFileSync(outPath, Buffer.from(bytes));
  console.log(outPath);
})();