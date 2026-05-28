const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

(async () => {
  const templatePath = path.join(process.cwd(), 'server', 'assets', 'contrat_template.pdf');
  const stampPath = path.join(process.cwd(), 'server', 'assets', 'cachet.jpg');
  const outPath = path.join(process.cwd(), 'server', 'contracts', 'sample-contract-template-filled-v4.pdf');

  const bytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(bytes);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const color = rgb(0, 0, 0);
  const paymentModeColor = rgb(0.8, 0.1, 0.1);
  const pages = pdfDoc.getPages();
  const page3 = pages[pdfDoc.getPageCount() - 1];

  const map = {
    fullName: { page: 1, x: 329.9, top: 274.9, maxWidth: 360, v: 'Rayen Elhafsi' },
    identityRef: { page: 1, x: 341.9, top: 294, maxWidth: 330, v: 'CIN 14449155' },
    userAddress: { page: 1, x: 345.9, top: 312.9, maxWidth: 455, v: 'Kelibia Nabeul' },
    userPhone: { page: 1, x: 346.9, top: 338.9, maxWidth: 220, v: '+21624879087' },
    typeLogement: { page: 1, x: 199.9, top: 439.3, maxWidth: 180, v: 'Ref REF-289, Villa S+3 Pied dans l\'eau, villa_maison' },
    adresseBien: { page: 1, x: 240.9, top: 455.9, maxWidth: 220, v: 'Kelibia, Nabeul' },
    capacite: { page: 1, x: 221.9, top: 472.9, maxWidth: 80, v: '4' },
    adultes: { page: 1, x: 329.9, top: 471.9, maxWidth: 80, v: '2 adulte(s)' },
    enfants: { page: 1, x: 417.9, top: 471.9, maxWidth: 80, v: '2 enfant(s)' },
    equipementsBien: { page: 1, x: 132.9, top: 506.9, maxWidth: 420, v: 'TV, Machine a laver, Climatisation, Cuisine equipee' },
    jj1: { page: 1, x: 75.9, top: 555.9, maxWidth: 28, v: '12' },
    mm1: { page: 1, x: 107.9, top: 555.9, maxWidth: 28, v: '06' },
    jj2: { page: 1, x: 184.9, top: 554.9, maxWidth: 28, v: '19' },
    mm2: { page: 1, x: 214.9, top: 555.9, maxWidth: 28, v: '06' },
    heureArrivee: { page: 1, x: 168.9, top: 570.9, maxWidth: 120, v: '14:00' },
    heureDepart: { page: 1, x: 169.9, top: 587.9, maxWidth: 120, v: '11:00' },
    loyerTotal: { page: 2, x: 360.9, top: 70.9, maxWidth: 180, v: '7 025,00 TND' },
    acompteReservation: { page: 2, x: 382.9, top: 97.9, maxWidth: 180, v: '3 513,00 TND' },
    jjp: { page: 2, x: 319.9, top: 113.9, maxWidth: 28, v: '31' },
    mmp: { page: 2, x: 367.9, top: 114.9, maxWidth: 28, v: '05' },
    hhp: { page: 2, x: 450.9, top: 113.9, maxWidth: 28, v: '19' },
    minp: { page: 2, x: 503.9, top: 113.9, maxWidth: 28, v: '16' },
    idPaiement: { page: 2, x: 353.9, top: 134.9, maxWidth: 230, v: 'PAY-REF289' },
    soldeArrivee: { page: 2, x: 364.9, top: 157.9, maxWidth: 180, v: '3 512,00 TND' },
    modePaiement: { page: 2, x: 473.9, top: 190.9, maxWidth: 200, v: 'Virement' },
    caution: { page: 2, x: 193.9, top: 453.9, maxWidth: 220, v: '1 000,00' },
    VS: { page: 3, x: 146.9, top: 191.9, maxWidth: 110, v: 'Kelibia' },
    JJs: { page: 3, x: 297.9, top: 189.9, maxWidth: 28, v: '28' },
    MMS: { page: 3, x: 343.9, top: 189.9, maxWidth: 28, v: '05' },
  };

  const TOP_NUDGE = -14;
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
