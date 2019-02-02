import { generatePdf } from '../lib/pdfgen';
import * as fs from 'fs';

const data = {
    isAuthenticated: true,
    cardsAllIds: ['TGFr1t-ZU', 'gM2yskI9K'],
    cardsById: {
        'TGFr1t-ZU': { id: 'TGFr1t-ZU', count: 2 },
        gM2yskI9K: { id: 'gM2yskI9K', count: 1 },
    },
    placeholders: {
        rHed2Qgja: {
            id: 'rHed2Qgja',
            type: 'text',
            x: 31,
            y: 221,
            width: 138,
            height: 52,
            angle: 0,
            align: 'right',
            color: '#000000',
            fontFamily: 'Ribeye',
            fontVariant: 'regular',
            fontSize: '28',
        },
        VhZw0FW1o: {
            id: 'VhZw0FW1o',
            type: 'image',
            x: 32,
            y: 22,
            width: 96,
            height: 111,
            angle: -0.04726816357087049,
        },
        xbhCNDeXc: {
            id: 'xbhCNDeXc',
            type: 'text',
            x: 31,
            y: 176,
            width: 103,
            height: 55,
            angle: -0.436705245370808,
            align: 'left',
            color: '#d022bb',
            fontFamily: 'Princess Sofia',
            fontVariant: 'regular',
            fontSize: '32',
        },
        DgZoUIhA3e: {
            id: 'DgZoUIhA3e',
            type: 'image',
            x: 22,
            y: 108,
            width: 50,
            height: 50,
            angle: 0,
        },
    },
    texts: {
        'TGFr1t-ZU': {
            rHed2Qgja: { value: 'Niced' },
            xbhCNDeXc: { value: 'Priest' },
        },
        gM2yskI9K: {
            rHed2Qgja: { value: 'Hello' },
            xbhCNDeXc: { value: 'Lov<font color="#ea2c6e">er</font><br>' },
        },
    },
    images: {
        'TGFr1t-ZU': { VhZw0FW1o: { url: '/api/imagefiles/lorc monkey' } },
        gM2yskI9K: { VhZw0FW1o: { url: '/api/imagefiles/faithtoken dragon-head' } },
    },
};

const stream = fs.createWriteStream('output.pdf');
generatePdf(data, 'http://localhost:5000', stream, () => {
    console.log('finished');
});
