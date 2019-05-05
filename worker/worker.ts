import { PDFGenerator } from '../lib/pdfgen';
import { JobData } from '../lib/types';
import { CardGenerator } from '../lib/card';

const blobStream = require('blob-stream');

onmessage = async (event: MessageEvent) => {
    // NOTE: uncomment this line if you need to see what data is passed to worker.
    // XXX: Do not deploy this to production.
    // console.log(JSON.stringify(event.data, null, 4));

    const data = event.data as JobData;

    if (data.type === 'generatePdf') {
        const stream = blobStream();
        new PDFGenerator().generatePdf(data, '', stream, () => {
            const url = stream.toBlobURL('application/pdf');
            postMessage({
                type: 'generatePdf',
                url,
            });
        });
    } else if (data.type === 'generateCard') {
        const cardGen = new CardGenerator('').processCard(data.cardSetdata, data.cardId, data.isBack);

        postMessage({
            type: 'generateCard',
            subType: 'start',
        });

        for await (const imageToDraw of cardGen) {
            postMessage({
                type: 'generateCard',
                subType: 'imageToDraw',
                imageToDraw,
            });
        }

        postMessage({
            type: 'generateCard',
            subType: 'stop',
        });
    }
};
