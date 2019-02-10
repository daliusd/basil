const PDFDocument: PDFKit.PDFDocument = require('pdfkit');
const buffer = require('buffer');
const SVGtoPDF = require('svg-to-pdfkit');
const axios = require('axios');

// Types
// XXX: Careful code duplication here. If you change types in saffron changes types here as well

export interface CardType {
    id: string;
    count: number;
}

export interface CardsCollection {
    [propName: string]: CardType;
}

export interface TextPlaceholderType {
    id: string;
    type: 'text';
    x: number;
    y: number;
    width: number;
    height: number;
    angle: number;
    align: string;
    color: string;
    fontFamily: string;
    fontVariant: string;
    fontSize: number;
}

export interface ImagePlaceholderType {
    id: string;
    type: 'image';
    x: number;
    y: number;
    width: number;
    height: number;
    angle: number;
}

export type PlaceholderType = TextPlaceholderType | ImagePlaceholderType;

export interface PlaceholdersCollection {
    [propName: string]: PlaceholderType;
}

export interface TextInfo {
    value: string;
}

export interface PlaceholdersTextInfoCollection {
    [propName: string]: TextInfo;
}

export interface PlaceholdersTextInfoByCardCollection {
    [propName: string]: PlaceholdersTextInfoCollection;
}

export interface ImageInfo {
    url: string;
}

export interface PlaceholdersImageInfoCollection {
    [propName: string]: ImageInfo;
}

export interface PlaceholdersImageInfoByCardCollection {
    [propName: string]: PlaceholdersImageInfoCollection;
}

export interface JobData {
    width: number;
    height: number;
    cardsAllIds: string[];
    cardsById: CardsCollection;
    placeholders: PlaceholdersCollection;
    texts: PlaceholdersTextInfoByCardCollection;
    images: PlaceholdersImageInfoByCardCollection;
    pageWidth: number;
    pageHeight: number;
    topBottomMargin: number;
    leftRightMargin: number;
}

// PDF Generator

const PTPMM = 72 / 25.4;

const makeRequest = async (url: string) => {
    return await axios.get(url, {
        responseType: 'arraybuffer',
    });
};

export const generatePdf = async (
    data: JobData,
    serverUrl: string,
    outStream: NodeJS.WritableStream,
    callback: () => void,
) => {
    try {
        const doc = new PDFDocument({
            size: [data.pageWidth * PTPMM, data.pageHeight * PTPMM],
            info: {
                Title: 'Cards',
                Author: 'Card-a-mon',
            },
        });

        const stream = doc.pipe(outStream);

        if (data.topBottomMargin * 2 + data.height > data.pageHeight) {
            throw new Error(
                'Cards do not fit in the page (height and margins are larger then page height). Reduce margins or card size.',
            );
        }

        if (data.leftRightMargin * 2 + data.width > data.pageWidth) {
            throw new Error(
                'Cards do not fit in the page (width and margins are larger then page width). Reduce margins or card size.',
            );
        }

        let cardWidth = data.width * PTPMM;
        let cardHeight = data.height * PTPMM;
        let cardX = data.leftRightMargin * PTPMM;
        let cardY = data.topBottomMargin * PTPMM;
        let addNewPage = false;

        for (const cardId of data.cardsAllIds) {
            const cardInfo = data.cardsById[cardId];
            for (let idx = 0; idx < cardInfo.count; idx++) {
                if (addNewPage) {
                    doc.addPage();
                    addNewPage = false;
                }
                // Draw card cut lines
                doc.save();

                doc.moveTo(cardX, cardY)
                    .lineTo(cardX + cardWidth, cardY)
                    .lineTo(cardX + cardWidth, cardY + cardHeight)
                    .lineTo(cardX, cardY + cardHeight)
                    .lineTo(cardX, cardY)
                    .dash(2 * PTPMM, {})
                    .lineWidth(0.1 * PTPMM)
                    .fillAndStroke('#fff', '#ccc');

                doc.restore();

                // Generate images
                const cardImages = data.images[cardId];
                for (const placeholderId in cardImages) {
                    const imageInfo = cardImages[placeholderId];
                    const placeholder = data.placeholders[placeholderId];

                    if (placeholder.type !== 'image') {
                        throw new Error('Corrupted data passed to PDF Generator.');
                    }

                    var arrayBuffer = await makeRequest(serverUrl + imageInfo.url);
                    const buf = buffer.Buffer.from(arrayBuffer.data);

                    SVGtoPDF(doc, buf.toString(), cardX + placeholder.x * PTPMM, cardY + placeholder.y * PTPMM, {
                        width: placeholder.width * PTPMM,
                        height: placeholder.height * PTPMM,
                    });
                }
                // Generate texts
                const cardTexts = data.texts[cardId];
                for (const placeholderId in cardTexts) {
                    const textInfo = cardTexts[placeholderId];
                    const placeholder = data.placeholders[placeholderId];

                    if (placeholder.type !== 'text') {
                        throw new Error('Corrupted data passed to PDF Generator.');
                    }

                    doc.save();
                    doc.translate(
                        cardX + (placeholder.x + placeholder.width / 2) * PTPMM,
                        cardY + (placeholder.y + placeholder.height / 2) * PTPMM,
                    );
                    doc.rotate((placeholder.angle * 180) / Math.PI);
                    doc.translate((-placeholder.width / 2) * PTPMM, (-placeholder.height / 2) * PTPMM);
                    doc.fontSize(placeholder.fontSize * PTPMM).text(textInfo.value, 0, 0, {
                        align: placeholder.align,
                        width: placeholder.width * PTPMM,
                        height: placeholder.height * PTPMM,
                    });
                    doc.restore();
                }

                // Get next card position
                cardX += cardWidth;
                if (cardX + cardWidth > (data.pageWidth - data.leftRightMargin) * PTPMM) {
                    cardX = data.leftRightMargin * PTPMM;
                    cardY += cardHeight;
                    if (cardY + cardHeight > (data.pageHeight - data.topBottomMargin) * PTPMM) {
                        cardY = data.topBottomMargin * PTPMM;
                        addNewPage = true;
                    }
                }
            }
        }

        doc.end();
        stream.on('finish', callback);
    } catch (error) {
        throw error;
    }
};
