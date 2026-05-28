const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

(async () => {
  const templatePath = path.join(process.cwd(), 'server', 'assets', 'contrat_template.pdf');
  const stampPath = path.join(process.cwd(), 'server', 'assets', 'cachet.jpg');
  const outPath = path.join(process.cwd(), 'server', 'contracts', 'sample-contract-template-filled-v5.pdf');

  const bytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(bytes);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const color = rgb(0, 0, 0);
  const paymentModeColor = rgb(0.8, 0.1, 0.1);
  const pages = pdfDoc.getPages();
  const page3 = pages[pdfDoc.getPageCount() - 1];

  const map = {
    fullName: { page: 1, x: 313.9, top: 279.9, maxWidth: 360, v: 'Rayen Elhafsi' },
    identityRef: { page: 1, x: 313.9, top: 302, maxWidth: 330, v: 'CIN 14449155' },
    userAddress: { page: 1, x: 314.9, top: 321.9, maxWidth: 455, v: 'Kelibia Nabeul' },
    userPhone: { page: 1, x: 310.9, top: 340.9, maxWidth: 220, v: '+21624879087' },
    typeLogement: { page: 1, x: 148.9, top: 448.3, maxWidth: 180, v: 'Ref REF-289, Villa S+3 Pied dans l\'eau, villa_maison' },
    adresseBien: { page: 1, x: 194.9, top: 461.9, maxWidth: 220, v: 'Kelibia, Nabeul' },
    capacite: { page: 1, x: 221.9, top: 472.9, maxWidth: 80, v: '4' },
    adultes: { page: 1, x: 329.9, top: 475.9, maxWidth: 80, v: '2 adulte(s)' },
    enfants: { page: 1, x: 392.9, top: 476.9, maxWidth: 80, v: '2 enfant(s)' },
    equipementsBien: { page: 1, x: 132.9, top: 506.9, maxWidth: 420, v: 'TV, Machine a laver, Climatisation, Cuisine equipee' },
    jj1: { page: 1, x: 76.9, top: 556.9, maxWidth: 28, v: '12' },
    mm1: { page: 1, x: 105.9, top: 556.9, maxWidth: 28, v: '06' },
    jj2: { page: 1, x: 181.9, top: 555.9, maxWidth: 28, v: '19' },
    mm2: { page: 1, x: 211.9, top: 555.9, maxWidth: 28, v: '06' },
    heureArrivee: { page: 1, x: 138.9, top: 571.9, maxWidth: 120, v: '14:00' },
    heureDepart: { page: 1, x: 139.9, top: 585.9, maxWidth: 120, v: '11:00' },
    loyerTotal: { page: 2, x: 381.9, top: 78.9, maxWidth: 180, v: '7 025,00 TND' },
    acompteReservation: { page: 2, x: 382.9, top: 100.9, maxWidth: 180, v: '3 513,00 TND' },
    jjp: { page: 2, x: 326.9, top: 120.9, maxWidth: 28, v: '31' },
    mmp: { page: 2, x: 365.9, top: 120.9, maxWidth: 28, v: '05' },
    hhp: { page: 2, x: 456.9, top: 120.9, maxWidth: 28, v: '19' },
    minp: { page: 2, x: 483.9, top: 120.9, maxWidth: 28, v: '16' },
    idPaiement: { page: 2, x: 382.9, top: 141.9, maxWidth: 230, v: 'PAY-REF289' },
    soldeArrivee: { page: 2, x: 382.9, top: 164.9, maxWidth: 180, v: '3 512,00 TND' },
    modePaiement: { page: 2, x: 473.9, top: 195.9, maxWidth: 200, v: 'Virement' },
    caution: { page: 2, x: 171, top: 461, maxWidth: 220, v: '1 000,00' },
    VS: { page: 3, x: 147.9, top: 197.9, maxWidth: 110, v: 'Kelibia' },
    JJs: { page: 3, x: 298.9, top: 197.9, maxWidth: 28, v: '28' },
    MMS: { page: 3, x: 341, top: 197, maxWidth: 28, v: '05' },
  };

  const TOP_NUDGE = 0;
  const drawTop = (page, text, x, top, maxWidth = 220, size = 11, customColor = color) => {
    const safe = String(text || '').replace(/\u202f/g, ' ').replace(/\u00a0/g, ' ');
    const h = page.getHeight();
    let out = safe;
    while (fontRegular.widthOfTextAtSize(out, size) > maxWidth && out.length > 3) out = out.slice(0, -1);
    page.drawText(out, { x, y: h - (top + TOP_NUDGE) - size, size, font: fontRegular, color: customColor });
  };

  Object.entries(map).forEach(([k, f]) => {
    const target = pages[Math.max(0, Number(f.page || 1) - 1)];
    if (!target) return;
    drawTop(target, f.v, f.x, f.top, f.maxWidth, 11, (k === 'modePaiement' ? paymentModeColor : color));
  });

  drawTop(page3, 'Hafsi Ghaith, Responsable commercial', 336, 736, 220, 10, color);
  if (fs.existsSync(stampPath)) {
    const stamp = await pdfDoc.embedJpg(fs.readFileSync(stampPath));
    const w = 130;
    const h = (stamp.height / stamp.width) * w;
    const ph = page3.getHeight();
    page3.drawImage(stamp, { x: 78, y: ph - 760 - h, width: w, height: h });
  }

  const outBytes = await pdfDoc.save();
  fs.writeFileSync(outPath, Buffer.from(outBytes));
  console.log(outPath);
})();
