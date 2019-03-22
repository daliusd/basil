const PDFDocument: PDFKit.PDFDocument = require('pdfkit');
const buffer = require('buffer');
const SVGtoPDF = require('svg-to-pdfkit');
const axios = require('axios');
const webFonts = require('./webfonts').webFonts;
const fontkit = require('fontkit');
const { SVGPathData } = require('svg-pathdata');

import { XmlDocument, XmlNode, XmlTextNode, XmlElement } from 'xmldoc';

// XXX: Careful! Code duplication here. If you change types or constants in saffron then change here as well.

// Constants
export const BLEED_WIDTH = 25.4 / 8; // 1/8th of inch in mm

// Types

export interface CardType {
    id: string;
    count: number;
}

export interface CardsCollection {
    [propName: string]: CardType;
}

export interface PlaceholderBase {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    angle: number;
    locked?: boolean;
    name?: string;
    isOnBack?: boolean;
}

export interface TextPlaceholderType extends PlaceholderBase {
    type: 'text';
    align: string;
    color: string;
    fontFamily: string;
    fontVariant: string;
    fontSize: number;
    lineHeight?: number;
}

export interface ImagePlaceholderType extends PlaceholderBase {
    id: string;
    type: 'image';
    fit?: string;
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
    base64?: string;
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
    isTwoSided: boolean;
    cardsAllIds: string[];
    cardsById: CardsCollection;
    placeholders: PlaceholdersCollection;
    placeholdersAllIds: string[];
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
    lineHeight: number;
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

            doc.translate(0, textOptions.fontSize * textOptions.lineHeight); // Move cursor one text line down
        }

        charNo++;
        if (charNo >= textSlices[sliceNo].text.length) {
            charNo = 0;
            sliceNo++;
        }
    }
    if (lineToDraw.length > 0) {
        drawTextLine(doc, lineToDraw, textOptions);
        doc.translate(0, textOptions.fontSize * textOptions.lineHeight); // Move cursor one text line down
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

async function drawCutLines(
    doc: PDFKit.PDFDocument,
    cardX: number,
    cardY: number,
    cardWidth: number,
    cardHeight: number,
) {
    doc.save();
    doc.moveTo(cardX, cardY)
        .lineTo(cardX + cardWidth, cardY)
        .lineTo(cardX + cardWidth, cardY + cardHeight)
        .lineTo(cardX, cardY + cardHeight)
        .lineTo(cardX, cardY)
        .dash(2 * PTPMM, {})
        .lineWidth(0.1 * PTPMM)
        .stroke('#ccc');

    doc.restore();
}

async function drawCard(
    doc: PDFKit.PDFDocument,
    data: JobData,
    serverUrl: string,
    knownFonts: { [key: string]: any },
    isBack: boolean,
    cardId: string,
    cardX: number,
    cardY: number,
    cardWidth: number,
    cardHeight: number,
) {
    const cardImages = data.images[cardId];
    const cardTexts = data.texts[cardId];

    doc.save();

    doc.rect(cardX, cardY, cardWidth, cardHeight).clip();
    doc.translate(-BLEED_WIDTH * PTPMM, -BLEED_WIDTH * PTPMM);

    for (const placeholderId of data.placeholdersAllIds) {
        const placeholder = data.placeholders[placeholderId];
        if ((placeholder.isOnBack || false) !== isBack) {
            continue;
        }

        if (placeholder.type === 'image' && cardImages) {
            const imageInfo = cardImages[placeholderId];

            if (imageInfo === undefined) continue;

            doc.save();
            doc.translate(
                cardX + (placeholder.x + placeholder.width / 2) * PTPMM,
                cardY + (placeholder.y + placeholder.height / 2) * PTPMM,
            );
            doc.rotate((placeholder.angle * 180) / Math.PI);
            doc.translate((-placeholder.width / 2) * PTPMM, (-placeholder.height / 2) * PTPMM);

            if (imageInfo.base64) {
                const svg = Buffer.from(imageInfo.base64, 'base64');
                SVGtoPDF(doc, svg.toString(), 0, 0, {
                    width: placeholder.width * PTPMM,
                    height: placeholder.height * PTPMM,
                    preserveAspectRatio:
                        placeholder.fit === 'stretch'
                            ? 'none'
                            : placeholder.fit === 'height'
                            ? 'xMinYMid slice'
                            : 'xMidYMin meet',
                });
            } else if (imageInfo.url) {
                try {
                    let resp = await makeRequest(serverUrl + imageInfo.url);
                    const buf = buffer.Buffer.from(resp.data);

                    if (resp.headers['content-type'] === 'image/svg+xml') {
                        SVGtoPDF(doc, buf.toString(), 0, 0, {
                            width: placeholder.width * PTPMM,
                            height: placeholder.height * PTPMM,
                            preserveAspectRatio: placeholder.fit === 'height' ? 'xMinYMid slice' : 'xMidYMin meet',
                        });
                    } else {
                        doc.image(buf, 0, 0, {
                            width:
                                !placeholder.fit || placeholder.fit === 'width' || placeholder.fit === 'stretch'
                                    ? placeholder.width * PTPMM
                                    : undefined,
                            height:
                                placeholder.fit === 'height' || placeholder.fit === 'stretch'
                                    ? placeholder.height * PTPMM
                                    : undefined,
                        });
                    }
                } catch {
                    // TODO: handle error here
                }
            }

            doc.restore();
        } else if (placeholder.type === 'text' && cardTexts) {
            const textInfo = cardTexts[placeholderId];

            if (textInfo === undefined) continue;

            const placeholder = data.placeholders[placeholderId];

            if (placeholder.type !== 'text') {
                throw new Error('Corrupted data passed to PDF Generator.');
            }
            let text = `<div>${textInfo.value.replace(/<br>/g, '<br/>')}</div>`;
            let parsedText = new XmlDocument('<div></div>');
            try {
                parsedText = new XmlDocument(text);
            } catch (error) {
                // TODO: we should do something with errors like this one
            }

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

            const fontHeight = (font.hhea.ascent - font.hhea.descent) / font.head.unitsPerEm;
            const addOn = ((placeholder.lineHeight || 1.27) - fontHeight) / 2;

            const textOptions: TextOptions = {
                font,
                fontSize,
                lineHeight: placeholder.lineHeight || 1.27,
                align: placeholder.align,
                width: placeholder.width * PTPMM,
                height: placeholder.height * PTPMM,
                ascent: (addOn + font.hhea.ascent / font.head.unitsPerEm) * fontSize,
                scale: (1.0 / font.head.unitsPerEm) * fontSize,
            };
            drawText(parsedText, doc, placeholder.color, textOptions);

            doc.restore();
        }
    }

    doc.restore();

    await drawCutLines(doc, cardX, cardY, cardWidth, cardHeight);
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

        const pageWidth = data.pageWidth * PTPMM;
        const pageHeight = data.pageHeight * PTPMM;
        const leftRightMargin = data.leftRightMargin * PTPMM;
        const topBottomMargin = data.topBottomMargin * PTPMM;
        const cardWidth = data.width * PTPMM;
        const cardHeight = data.height * PTPMM;

        let cardX = leftRightMargin;
        let cardY = topBottomMargin;
        let addNewPage = false;
        let knownFonts: { [key: string]: any } = {};
        let frontCards: { cardX: number; cardY: number; cardId: string }[] = [];

        for (const cardId of data.cardsAllIds) {
            const cardInfo = data.cardsById[cardId];

            for (let idx = 0; idx < cardInfo.count; idx++) {
                if (addNewPage) {
                    if (data.isTwoSided) {
                        doc.addPage();
                        for (const cardInfo of frontCards) {
                            let x = pageWidth - cardInfo.cardX - cardWidth;
                            let y = cardInfo.cardY;
                            await drawCard(
                                doc,
                                data,
                                serverUrl,
                                knownFonts,
                                true,
                                cardInfo.cardId,
                                x,
                                y,
                                cardWidth,
                                cardHeight,
                            );
                        }

                        frontCards = [];
                    }
                    doc.addPage();
                    addNewPage = false;
                }
                frontCards.push({ cardX, cardY, cardId });
                await drawCard(doc, data, serverUrl, knownFonts, false, cardId, cardX, cardY, cardWidth, cardHeight);

                // Get next card position
                cardX += cardWidth;
                if (cardX + cardWidth > pageWidth - leftRightMargin) {
                    cardX = leftRightMargin;
                    cardY += cardHeight;
                    if (cardY + cardHeight > pageHeight - topBottomMargin) {
                        cardY = topBottomMargin;
                        addNewPage = true;
                    }
                }
            }
        }

        if (data.isTwoSided && frontCards.length > 0) {
            doc.addPage();
            for (const cardInfo of frontCards) {
                let x = pageWidth - cardInfo.cardX - cardWidth;
                let y = cardInfo.cardY;
                await drawCard(doc, data, serverUrl, knownFonts, true, cardInfo.cardId, x, y, cardWidth, cardHeight);
            }
        }

        doc.end();
        stream.on('finish', callback);
    } catch (error) {
        throw error;
    }
};
