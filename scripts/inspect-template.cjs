const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
(async () => {
  const bytes = fs.readFileSync('server/assets/contrat_template.pdf');
  const pdf = await PDFDocument.load(bytes);
  const form = pdf.getForm();
  const fields = form.getFields();
  console.log('pages', pdf.getPageCount());
  console.log('fields', fields.length);
  for (const f of fields) console.log(f.getName(), f.constructor.name);
})();