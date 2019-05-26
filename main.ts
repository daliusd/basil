import axios from 'axios';
import * as yargs from 'yargs';

import * as fs from 'fs';

import { PdfJobData } from './lib/types';
import { PDFGenerator } from './lib/pdfgen';

const SERVER = 'http://localhost:5000';

const generatePdfForSample = async (username: string, password: string) => {
    try {
        const resp = await axios.post(`${SERVER}/api/tokens`, { username, password });
        const accessToken = resp.data['accessToken'];

        const data: PdfJobData = {
            type: 'generatePdf',
            collectionType: 'cardsets',
            collectionId: '668',
            pageWidth: 210,
            pageHeight: 297,
            topBottomMargin: 15,
            leftRightMargin: 9,
            verticalSpace: 0,
            horizontalSpace: 0,
            includeBleedingArea: true,
            cutMarksForScissors: false,
            cutMarksForGuillotine: true,
            cutMarksInMarginArea: true,
            cutMarksOnFrontSideOnly: true,
            accessToken,
        };

        const stream = fs.createWriteStream('output.pdf');
        new PDFGenerator().generatePdf(data, SERVER, stream, () => {
            console.log('finished');
        });
    } catch (err) {
        console.log(err);
    }
};

generatePdfForSample(yargs.argv['username'] as string, yargs.argv['password'] as string);
