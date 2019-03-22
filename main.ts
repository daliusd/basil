import * as fs from 'fs';
import { JobData, generatePdf } from './lib/pdfgen';
import * as yargs from 'yargs';
import axios from 'axios';

const SERVER = 'http://localhost:5000';

const generatePdfForSample = async (username: string, password: string) => {
    try {
        const resp = await axios.post(`${SERVER}/api/tokens`, { username, password });
        const accessToken = resp.data['accessToken'];

        const data: JobData = {
            pageWidth: 210,
            pageHeight: 297,
            topBottomMargin: 15,
            leftRightMargin: 9,
            collectionType: 'cardsets',
            collectionId: '2',
            includeBleedingArea: true,
            accessToken,
        };

        const stream = fs.createWriteStream('output.pdf');
        generatePdf(data, SERVER, stream, () => {
            console.log('finished');
        });
    } catch (err) {
        console.log(err);
    }
};

generatePdfForSample(yargs.argv['username'] as string, yargs.argv['password'] as string);
