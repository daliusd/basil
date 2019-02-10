import { generatePdf } from '../lib/pdfgen';
import * as fs from 'fs';

const data = {
    cardsAllIds: ['YKEWya2ef', 'e5wV1082R'],
    cardsById: {
        YKEWya2ef: {
            id: 'YKEWya2ef',
            count: 1,
        },
        e5wV1082R: {
            id: 'e5wV1082R',
            count: 2,
        },
    },
    placeholders: {
        o0Kh4zsgz: {
            id: 'o0Kh4zsgz',
            type: 'image',
            x: 23.283333333333335,
            y: 48.41875,
            width: 37.041666666666664,
            height: 35.71875,
            angle: 0,
        },
        dpBZ7ZVEs: {
            id: 'dpBZ7ZVEs',
            type: 'text',
            x: 2.910416666666667,
            y: 6.879166666666666,
            width: 56.62083333333334,
            height: 13.229166666666666,
            angle: -0.13017305440325466,
            align: 'center',
            color: '#000000',
            fontFamily: 'Mountains of Christmas',
            fontVariant: 'regular',
            fontSize: 8,
        },
    },
    texts: {
        YKEWya2ef: {
            dpBZ7ZVEs: {
                value: 'RIVER',
            },
        },
        e5wV1082R: {
            dpBZ7ZVEs: {
                value: 'MOUNTAIN',
            },
        },
    },
    images: {
        YKEWya2ef: {
            o0Kh4zsgz: {
                url: '/api/imagefiles/delapouite river',
            },
        },
        e5wV1082R: {
            o0Kh4zsgz: {
                url: '/api/imagefiles/delapouite mountain-cave',
            },
        },
    },
    pageWidth: 210,
    pageHeight: 297,
    topBottomMargin: 20,
    leftRightMargin: 20,
};

const stream = fs.createWriteStream('output.pdf');
generatePdf(data, 'http://localhost:5000', stream, () => {
    console.log('finished');
});
