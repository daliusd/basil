import * as fs from 'fs';
import { JobData, generatePdf } from './lib/pdfgen';
import * as yargs from 'yargs';

const SERVER = 'https://cardamon.ffff.lt';

const generatePdfForSample = (sampleFileName: string) => {
    const data: JobData = JSON.parse(fs.readFileSync(`samples/sample${sampleFileName}.json`, 'utf8'));

    const stream = fs.createWriteStream('output.pdf');
    generatePdf(data, SERVER, stream, () => {
        console.log('finished');
    });
};

generatePdfForSample(yargs.argv['sample'] as string);
