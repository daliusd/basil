const generatePdf = require('../lib/pdfgen').generatePdf;
const blobStream = require('blob-stream');

onmessage = (event: MessageEvent) => {
    // NOTE: uncomment this line if you need to see what data is passed to worker.
    // XXX: Do not deploy this to production.
    console.log(JSON.stringify(event.data, null, 4));
    const stream = blobStream();
    generatePdf(event.data, '', stream, () => {
        const url = stream.toBlobURL('application/pdf');
        postMessage(url);
    });
};
