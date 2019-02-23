const PDFDocument: PDFKit.PDFDocument = require('pdfkit');
const buffer = require('buffer');
const SVGtoPDF = require('svg-to-pdfkit');
const axios = require('axios');
const webFonts = require('./webfonts').webFonts;
const fontkit = require('fontkit');
const { SVGPathData } = require('svg-pathdata');

import { XmlDocument, XmlNode, XmlTextNode, XmlElement } from 'xmldoc';

// Types
// XXX: Careful! Code duplication here. If you change types in saffron changes types here as well

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

// Text drawing
interface TextSlice {
    text: string;
    color: string;
}

interface TextOptions {
    font: any;
    fontSize: number;
    align: string;
    width: number;
    height: number;
    ascent: number;
    scale: number;
}

interface TextLineGlyph {
    glyph: any;
    color: string;
    advanceWidth: number;
}

function flip(svgPath: string) {
    const pathData = new SVGPathData(svgPath);
    const flipped = pathData.matrix(1, 0, 0, -1, 0, 0).encode();

    return flipped;
}

function drawTextLine(doc: PDFKit.PDFDocument, textLine: TextLineGlyph[], textOptions: TextOptions) {
    const lineWidth = textLine.map(l => l.advanceWidth).reduce((a, b) => a + b, 0);

    doc.save();
    doc.translate(0, textOptions.ascent);

    if (textOptions.align === 'center') {
        doc.translate((textOptions.width - lineWidth) / 2, 0);
    } else if (textOptions.align === 'right') {
        doc.translate(textOptions.width - lineWidth, 0);
    }

    for (const tlg of textLine) {
        doc.fillColor(tlg.color);

        doc.save();
        doc.scale(textOptions.scale, textOptions.scale);
        const flipped = flip(tlg.glyph.path.toSVG());
        doc.path(flipped).fill();
        doc.restore();

        doc.translate(tlg.advanceWidth, 0);
    }

    doc.restore();
}

function drawTextSlices(doc: PDFKit.PDFDocument, textSlices: TextSlice[], textOptions: TextOptions) {
    const joinedText = textSlices.map(ts => ts.text).join('');
    let run = textOptions.font.layout(joinedText);

    let lineToDraw: TextLineGlyph[] = [];
    let lineWidth = 0;
    let sliceNo = 0;
    let charNo = 0;
    let lastSpace = -1;
    for (let glyph of run.glyphs) {
        let advanceWidth = (glyph.advanceWidth / textOptions.font.head.unitsPerEm) * textOptions.fontSize;

        lineToDraw.push({ glyph, color: textSlices[sliceNo].color, advanceWidth });
        if (lineToDraw.length > 1 && textSlices[sliceNo].text[charNo] === ' ') {
            lastSpace = lineToDraw.length - 1;
        }

        lineWidth += advanceWidth;
        if (lineWidth > textOptions.width) {
            let partToDraw: TextLineGlyph[] = [];
            if (lastSpace !== -1) {
                partToDraw = lineToDraw.splice(0, lastSpace);
                lineToDraw = lineToDraw.slice(1); // Remove space for remaining part
            } else {
                partToDraw = lineToDraw.splice(0, lineToDraw.length - 1);
            }

            drawTextLine(doc, partToDraw, textOptions);
            lineWidth = lineToDraw.map(l => l.advanceWidth).reduce((a, b) => a + b, 0);
            lastSpace = -1;

            doc.translate(0, textOptions.fontSize * 1.27); // Move cursor one text line down
        }

        charNo++;
        if (charNo >= textSlices[sliceNo].text.length) {
            charNo = 0;
            sliceNo++;
        }
    }
    if (lineToDraw.length > 0) {
        drawTextLine(doc, lineToDraw, textOptions);
        doc.translate(0, textOptions.fontSize * 1.27); // Move cursor one text line down
    }
}

function drawText(node: XmlNode, doc: PDFKit.PDFDocument, color: string, textOptions: TextOptions): TextSlice[] {
    let textSlices: TextSlice[] = [];
    if (node.type !== 'element') {
        return [];
    }

    for (const child of node.children) {
        if (child.type === 'text') {
            textSlices.push({ text: child.text, color });
        } else if (child.type === 'element') {
            let newColor = color;
            if (child.name === 'font' && 'color' in child.attr) {
                newColor = child.attr['color'];
            }
            textSlices = [...textSlices, ...drawText(child, doc, newColor, textOptions)];
        }
    }

    if (node.name === 'div') {
        drawTextSlices(doc, textSlices, textOptions);
        return [];
    }
    return textSlices;
}

// PDF generation

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
        let knownFonts: { [key: string]: any } = {};

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

                    doc.save();
                    doc.translate(
                        cardX + (placeholder.x + placeholder.width / 2) * PTPMM,
                        cardY + (placeholder.y + placeholder.height / 2) * PTPMM,
                    );
                    doc.rotate((placeholder.angle * 180) / Math.PI);
                    doc.translate((-placeholder.width / 2) * PTPMM, (-placeholder.height / 2) * PTPMM);

                    SVGtoPDF(doc, buf.toString(), 0, 0, {
                        width: placeholder.width * PTPMM,
                        height: placeholder.height * PTPMM,
                    });

                    doc.restore();
                }
                // Generate texts
                const cardTexts = data.texts[cardId];
                for (const placeholderId in cardTexts) {
                    const textInfo = cardTexts[placeholderId];
                    const placeholder = data.placeholders[placeholderId];

                    if (placeholder.type !== 'text') {
                        throw new Error('Corrupted data passed to PDF Generator.');
                    }
                    let text = `<div>${textInfo.value.replace(/<br>/g, '<br/>')}</div>`;
                    let parsedText = new XmlDocument(text);

                    doc.save();
                    doc.translate(
                        cardX + (placeholder.x + placeholder.width / 2) * PTPMM,
                        cardY + (placeholder.y + placeholder.height / 2) * PTPMM,
                    );
                    doc.rotate((placeholder.angle * 180) / Math.PI);
                    doc.translate((-placeholder.width / 2) * PTPMM, (-placeholder.height / 2) * PTPMM);

                    const fontName = `${placeholder.fontFamily}:${placeholder.fontVariant}`;
                    if (
                        !(fontName in knownFonts) &&
                        placeholder.fontFamily in webFonts &&
                        placeholder.fontVariant in webFonts[placeholder.fontFamily]
                    ) {
                        let fontUrl = webFonts[placeholder.fontFamily][placeholder.fontVariant];
                        fontUrl = fontUrl.replace('http://', 'https://');
                        var arrayBuffer = await makeRequest(fontUrl);
                        const buf = buffer.Buffer.from(arrayBuffer.data);

                        let font = fontkit.create(buf);
                        knownFonts[fontName] = font;
                    }

                    let font = knownFonts[fontName];

                    let fontSize = placeholder.fontSize * PTPMM;
                    const textOptions: TextOptions = {
                        font,
                        fontSize,
                        align: placeholder.align,
                        width: placeholder.width * PTPMM,
                        height: placeholder.height * PTPMM,
                        ascent: (font.hhea.ascent / font.head.unitsPerEm) * fontSize,
                        scale: (1.0 / font.head.unitsPerEm) * fontSize,
                    };
                    drawText(parsedText, doc, placeholder.color, textOptions);

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
