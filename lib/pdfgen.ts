const PDFDocument: PDFKit.PDFDocument = require('pdfkit');
const buffer = require('buffer');
const SVGtoPDF = require('svg-to-pdfkit');
const axios = require('axios');

const makeRequest = async (url: string) => {
    return await axios.get(url, {
        responseType: 'arraybuffer',
    });
};

export const generatePdf = async (
    data: any,
    serverUrl: string,
    outStream: NodeJS.WritableStream,
    callback: () => void,
) => {
    try {
        const doc = new PDFDocument();

        const stream = doc.pipe(outStream);

        const images = data['images'];
        let y = 100;
        for (const pl in images) {
            const cards = images[pl];
            for (const card in cards) {
                const url = cards[card]['url'];
                doc.fontSize(25).text(url, 100, y);
                y += 40;

                var arrayBuffer = await makeRequest(serverUrl + url);

                const buf = buffer.Buffer.from(arrayBuffer.data);
                console.log('hi');
                console.log(buf.toString());

                doc.fontSize(25).text(buf.toString(), 100, y);

                SVGtoPDF(doc, buf.toString(), 200, y, { width: 100, height: 100 });

                y += 40;
            }
        }

        doc.fontSize(25).text(data['cardsAllIds'], 150, 100);

        doc.end();
        stream.on('finish', callback);
    } catch (error) {
        console.log(error);
    }
};
