import * as fs from 'fs';
import * as prompt from 'prompt';
import { JobData, generatePdf } from './lib/pdfgen';
import * as yargs from 'yargs';

const SERVER = 'https://cardamon.ffff.lt';

prompt.override = yargs.argv;
prompt.start();

var schema = {
    properties: {
        sample: {
            default: '01',
        },
    },
};

const generatePdfForSample = sampleFileName => {
    const data: JobData = JSON.parse(fs.readFileSync(`samples/sample${sampleFileName}.json`, 'utf8'));

    const stream = fs.createWriteStream('output.pdf');
    generatePdf(data, SERVER, stream, () => {
        console.log('finished');
    });
};

prompt.get(schema, function(err, result) {
    generatePdfForSample(result.sample);
});
