const generatePdf = require('../lib/pdfgen').generatePdf;
const blobStream = require('blob-stream');

onmessage = (event: MessageEvent) => {
    const stream = blobStream();
    generatePdf(event.data, '', stream, () => {
        const url = stream.toBlobURL('application/pdf');
        postMessage(url);
    });
};
