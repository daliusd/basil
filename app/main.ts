import * as fs from 'fs';
import * as prompt from 'prompt';
import { JobData, generatePdf } from '../lib/pdfgen';

const PATH_TO_SEARCH = '../icons/';
const SERVER = 'http://localhost:5000';

prompt.start();

var schema = {
    properties: {
        sample: {
            default: '01',
        },
    },
};

prompt.get(schema, function(err, result) {
    generatePdfForSample(result.sample);
});

const generatePdfForSample = sampleFileName => {
    const data: JobData = JSON.parse(fs.readFileSync(`sample${sampleFileName}.json`, 'utf8'));

    const stream = fs.createWriteStream('output.pdf');
    generatePdf(data, 'http://localhost:5000', stream, () => {
        console.log('finished');
    });
};
