const PDFDocument: PDFKit.PDFDocument = require('pdfkit');
const blobStream = require('blob-stream');

self.addEventListener('message', () => {
    const doc = new PDFDocument();

    const stream = doc.pipe(blobStream());

    doc.fontSize(25)
       .text('Here is some vector graphics...', 100, 100);

    doc.end();
    stream.on('finish', function() {
        const url = stream.toBlobURL('application/pdf');
        postMessage(url);
    });
});
