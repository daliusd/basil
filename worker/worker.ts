import { PDFGenerator } from '../lib/pdfgen';
import { JobData, CardJobData } from '../lib/types';
import { CardGenerator } from '../lib/card';

const blobStream = require('blob-stream');

async function generateCards(data: CardJobData) {
    const cardGen = new CardGenerator('').processCard(data.cardSetData, data.cardId, data.isBack);

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

onmessage = (event: MessageEvent) => {
    // NOTE: uncomment this line if you need to see what data is passed to worker.
    // XXX: Do not deploy this to production.
    // console.log(JSON.stringify(event.data, null, 4));

    try {
        const data = event.data as JobData;
        if (data.type === 'generatePdf') {
            const stream = blobStream();
            new PDFGenerator()
                .generatePdf(data, '', stream, () => {
                    const url = stream.toBlobURL('application/pdf');
                    postMessage({
                        type: 'generatePdf',
                        url,
                    });
                })
                .catch(err => {
                    postMessage({
                        type: 'generateError',
                        error: { message: err.message, stack: err.stack },
                    });
                });
        } else if (data.type === 'generateCard') {
            generateCards(data).catch(err => {
                postMessage({
                    type: 'generateError',
                    error: { message: err.message, stack: err.stack },
                });
            });
        }
    } catch (e) {
        postMessage({
            type: 'generateError',
            error: { message: e.message, stack: e.stack },
        });
    }
};

onerror = (e: ErrorEvent) => {
    console.log('got you');
    postMessage({
        type: 'generateError',
        error: { message: e.message, stack: `${e.filename}:${e.lineno}` },
    });
    e.preventDefault();
};
