import PDFDocument = require('pdfkit');

import { CardSetData, JobData } from './types';

const SVGtoPDF = require('svg-to-pdfkit');
const axios = require('axios');
const buffer = require('buffer');

const webFonts = require('./webfonts').webFonts;
const fontkit = require('fontkit');
const { SVGPathData } = require('svg-pathdata');

import { parse, HTMLElement, NodeType } from 'node-html-parser';

// Constants
export const BLEED_WIDTH = 25.4 / 8; // 1/8th of inch in mm

// PDF Generator

const PTPMM = 72 / 25.4;

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

export class PDFGenerator {
    doc: PDFKit.PDFDocument = new PDFDocument();
    knownFonts: Record<string, any> = {};
    serverUrl: string = '';

    makeRequest = async (url: string) => {
        return await axios.get(url, {
            responseType: 'arraybuffer',
        });
    };

    makeAuthRequest = async (url: string, token: string) => {
        let config = {
            headers: { Authorization: `Bearer ${token}` },
        };

        return await axios.get(url, config);
    };

    flip(svgPath: string) {
        const pathData = new SVGPathData(svgPath);
        const flipped = pathData.matrix(1, 0, 0, -1, 0, 0).encode();

        return flipped;
    }

    drawTextLine(textLine: TextLineGlyph[], textOptions: TextOptions) {
        const lineWidth = textLine.map(l => l.advanceWidth).reduce((a, b) => a + b, 0);

        this.doc.save();
        this.doc.translate(0, textOptions.ascent);

        if (textOptions.align === 'center') {
            this.doc.translate((textOptions.width - lineWidth) / 2, 0);
        } else if (textOptions.align === 'right') {
            this.doc.translate(textOptions.width - lineWidth, 0);
        }

        for (const tlg of textLine) {
            this.doc.fillColor(tlg.color);

            this.doc.save();
            this.doc.scale(textOptions.scale, textOptions.scale);
            const flipped = this.flip(tlg.glyph.path.toSVG());
            this.doc.path(flipped).fill();
            this.doc.restore();

            this.doc.translate(tlg.advanceWidth, 0);
        }

        this.doc.restore();
    }

    drawTextSlices(textSlices: TextSlice[], textOptions: TextOptions) {
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

                this.drawTextLine(partToDraw, textOptions);
                lineWidth = lineToDraw.map(l => l.advanceWidth).reduce((a, b) => a + b, 0);
                lastSpace = -1;

                this.doc.translate(0, textOptions.fontSize * textOptions.lineHeight); // Move cursor one text line down
            }

            charNo++;
            if (charNo >= textSlices[sliceNo].text.length) {
                charNo = 0;
                sliceNo++;
            }
        }
        if (lineToDraw.length > 0) {
            this.drawTextLine(lineToDraw, textOptions);
            this.doc.translate(0, textOptions.fontSize * textOptions.lineHeight); // Move cursor one text line down
        }
    }

    drawText(node: HTMLElement, color: string, textOptions: TextOptions): TextSlice[] {
        let textSlices: TextSlice[] = [];
        if (node.nodeType !== NodeType.ELEMENT_NODE) {
            return [];
        }

        for (const child of node.childNodes) {
            if (child.nodeType === NodeType.TEXT_NODE) {
                textSlices.push({ text: child.text, color });
            } else if (child.nodeType === NodeType.ELEMENT_NODE) {
                const element = child as HTMLElement;
                let newColor = color;
                if (element.tagName === 'font' && 'color' in element.attributes) {
                    newColor = element.attributes['color'];
                }
                textSlices = [...textSlices, ...this.drawText(element, newColor, textOptions)];
            }
        }

        if (node.tagName === 'div') {
            this.drawTextSlices(textSlices, textOptions);
            return [];
        }
        return textSlices;
    }

    drawCutMarksForGuillotine(
        verticalGuillotineMarks: number[],
        horizontalGuillotineMarks: number[],
        pageWidth: number,
        pageHeight: number,
        leftRightMargin: number,
        topBottomMargin: number,
    ) {
        this.doc.save();

        for (const x of verticalGuillotineMarks) {
            this.doc
                .moveTo(x, 0)
                .lineTo(x, topBottomMargin / 2)
                .lineWidth(0.1 * PTPMM)
                .stroke('#000');

            this.doc
                .moveTo(x, pageHeight)
                .lineTo(x, pageHeight - topBottomMargin / 2)
                .lineWidth(0.1 * PTPMM)
                .stroke('#000');
        }

        for (const y of horizontalGuillotineMarks) {
            this.doc
                .moveTo(0, y)
                .lineTo(leftRightMargin / 2, y)
                .lineWidth(0.1 * PTPMM)
                .stroke('#000');

            this.doc
                .moveTo(pageWidth, y)
                .lineTo(pageWidth - leftRightMargin / 2, y)
                .lineWidth(0.1 * PTPMM)
                .stroke('#000');
        }

        this.doc.restore();
    }

    async drawCutLines(cardX: number, cardY: number, cardWidth: number, cardHeight: number) {
        this.doc.save();
        this.doc
            .moveTo(cardX, cardY)
            .lineTo(cardX + cardWidth, cardY)
            .lineTo(cardX + cardWidth, cardY + cardHeight)
            .lineTo(cardX, cardY + cardHeight)
            .lineTo(cardX, cardY)
            .dash(2 * PTPMM, {})
            .lineWidth(0.1 * PTPMM)
            .stroke('#ccc');

        this.doc.restore();
    }

    async drawCard(
        data: CardSetData,
        jobData: JobData,
        isBack: boolean,
        cardId: string,
        cardX: number,
        cardY: number,
        cardWidth: number,
        cardHeight: number,
    ) {
        const cardImages = data.images[cardId];
        const cardTexts = data.texts[cardId];

        this.doc.save();

        this.doc.rect(cardX, cardY, cardWidth, cardHeight).clip();
        if (!jobData.includeBleedingArea) {
            this.doc.translate(-BLEED_WIDTH * PTPMM, -BLEED_WIDTH * PTPMM);
        }

        for (const placeholderId of data.placeholdersAllIds) {
            const placeholder = data.placeholders[placeholderId];
            if ((placeholder.isOnBack || false) !== isBack) {
                continue;
            }

            if (placeholder.type === 'image' && cardImages) {
                const imageInfo = cardImages[placeholderId];

                if (imageInfo === undefined) continue;

                this.doc.save();
                this.doc.translate(
                    cardX + (placeholder.x + placeholder.width / 2) * PTPMM,
                    cardY + (placeholder.y + placeholder.height / 2) * PTPMM,
                );
                this.doc.rotate((placeholder.angle * 180) / Math.PI);
                this.doc.translate((-placeholder.width / 2) * PTPMM, (-placeholder.height / 2) * PTPMM);

                if (imageInfo.base64) {
                    const svg = Buffer.from(imageInfo.base64, 'base64');
                    SVGtoPDF(this.doc, svg.toString(), 0, 0, {
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
                        let resp = await this.makeRequest(this.serverUrl + imageInfo.url);
                        const buf = buffer.Buffer.from(resp.data);

                        if (resp.headers['content-type'] === 'image/svg+xml') {
                            SVGtoPDF(this.doc, buf.toString(), 0, 0, {
                                width: placeholder.width * PTPMM,
                                height: placeholder.height * PTPMM,
                                preserveAspectRatio: placeholder.fit === 'height' ? 'xMinYMid slice' : 'xMidYMin meet',
                            });
                        } else {
                            this.doc.image(buf, 0, 0, {
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

                this.doc.restore();
            } else if (placeholder.type === 'text' && cardTexts) {
                const textInfo = cardTexts[placeholderId];

                if (textInfo === undefined) continue;

                const placeholder = data.placeholders[placeholderId];

                if (placeholder.type !== 'text') {
                    throw new Error('Corrupted data passed to PDF Generator.');
                }
                let text = `<div>${textInfo.value.replace(/<br>/g, '<br/>')}</div>`;
                let parsedText = parse('<div></div>');
                try {
                    parsedText = parse(text);
                } catch (error) {
                    // TODO: we should do something with errors like this one
                }

                this.doc.save();
                this.doc.translate(
                    cardX + (placeholder.x + placeholder.width / 2) * PTPMM,
                    cardY + (placeholder.y + placeholder.height / 2) * PTPMM,
                );
                this.doc.rotate((placeholder.angle * 180) / Math.PI);
                this.doc.translate((-placeholder.width / 2) * PTPMM, (-placeholder.height / 2) * PTPMM);

                const fontName = `${placeholder.fontFamily}:${placeholder.fontVariant}`;
                if (
                    !(fontName in this.knownFonts) &&
                    placeholder.fontFamily in webFonts &&
                    placeholder.fontVariant in webFonts[placeholder.fontFamily]
                ) {
                    let fontUrl = webFonts[placeholder.fontFamily][placeholder.fontVariant];
                    fontUrl = fontUrl.replace('http://', 'https://');
                    var arrayBuffer = await this.makeRequest(fontUrl);
                    const buf = buffer.Buffer.from(arrayBuffer.data);

                    let font = fontkit.create(buf);
                    this.knownFonts[fontName] = font;
                }

                let font = this.knownFonts[fontName];

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
                this.drawText(parsedText as HTMLElement, placeholder.color, textOptions);

                this.doc.restore();
            }
        }

        this.doc.restore();

        if (jobData.cutMarksForScissors) {
            await this.drawCutLines(
                cardX + (jobData.includeBleedingArea ? BLEED_WIDTH * PTPMM : 0),
                cardY + (jobData.includeBleedingArea ? BLEED_WIDTH * PTPMM : 0),
                cardWidth - (jobData.includeBleedingArea ? BLEED_WIDTH * 2 * PTPMM : 0),
                cardHeight - (jobData.includeBleedingArea ? BLEED_WIDTH * 2 * PTPMM : 0),
            );
        }
    }

    // PDF generation

    generatePdf = async (data: JobData, serverUrl: string, outStream: NodeJS.WritableStream, callback: () => void) => {
        try {
            let cardsets: CardSetData[] = [];
            this.serverUrl = serverUrl;

            // Get Card Sets
            if (data.collectionType === 'games') {
                let resp = await this.makeAuthRequest(
                    `${this.serverUrl}/api/${data.collectionType}/${data.collectionId}`,
                    data.accessToken,
                );
                const cardsetsList = resp.data.cardsets;
                for (const cardsetInfo of cardsetsList) {
                    resp = await this.makeAuthRequest(
                        `${this.serverUrl}/api/cardsets/${cardsetInfo.id}`,
                        data.accessToken,
                    );
                    let cardsetData: CardSetData = JSON.parse(resp.data.data);
                    cardsets.push(cardsetData);
                }
            } else {
                let resp = await this.makeAuthRequest(
                    `${this.serverUrl}/api/${data.collectionType}/${data.collectionId}`,
                    data.accessToken,
                );
                let cardsetData: CardSetData = JSON.parse(resp.data.data);
                cardsets.push(cardsetData);
            }

            // Prepare job data
            this.doc = new PDFDocument({
                size: [data.pageWidth * PTPMM, data.pageHeight * PTPMM],
                info: {
                    Title: 'Cards',
                    Author: 'Card-a-mon',
                },
            });

            const stream = this.doc.pipe(outStream);

            const pageWidth = data.pageWidth * PTPMM;
            const pageHeight = data.pageHeight * PTPMM;
            const leftRightMargin = data.leftRightMargin * PTPMM;
            const topBottomMargin = data.topBottomMargin * PTPMM;
            const verticalSpace = data.verticalSpace * PTPMM;
            const horizontalSpace = data.horizontalSpace * PTPMM;

            const isTwoSided = cardsets.map(cs => cs.isTwoSided).reduce((a, b) => a || b, false);

            let cardX = leftRightMargin;
            let cardY = topBottomMargin;
            let prevCardWidth = 0;
            let prevCardHeight = 0;
            let addNewPage = false;
            let frontCards: {
                cardX: number;
                cardY: number;
                cardWidth: number;
                cardHeight: number;
                cardId: string;
                cardsetData: CardSetData;
            }[] = [];

            let verticalGuillotineMarks: number[] = [];
            let horizontalGuillotineMarks: number[] = [];

            for (const cardsetData of cardsets) {
                if (data.topBottomMargin * 2 + cardsetData.height > data.pageHeight) {
                    throw new Error(
                        'Cards do not fit in the page (height and margins are larger then page height). Reduce margins or card size.',
                    );
                }

                if (data.leftRightMargin * 2 + cardsetData.width > data.pageWidth) {
                    throw new Error(
                        'Cards do not fit in the page (width and margins are larger then page width). Reduce margins or card size.',
                    );
                }

                const cardWidth = (cardsetData.width + (data.includeBleedingArea ? BLEED_WIDTH * 2 : 0)) * PTPMM;
                const cardHeight = (cardsetData.height + (data.includeBleedingArea ? BLEED_WIDTH * 2 : 0)) * PTPMM;

                if (
                    prevCardHeight !== 0 &&
                    prevCardWidth !== 0 &&
                    (prevCardHeight !== cardHeight || prevCardWidth !== cardWidth)
                ) {
                    addNewPage = true;
                    cardX = leftRightMargin;
                    cardY = topBottomMargin;
                }

                prevCardHeight = cardHeight;
                prevCardWidth = cardWidth;

                for (const cardId of cardsetData.cardsAllIds) {
                    const cardInfo = cardsetData.cardsById[cardId];

                    for (let idx = 0; idx < cardInfo.count; idx++) {
                        if (addNewPage) {
                            if (isTwoSided) {
                                if (data.cutMarksForGuillotine) {
                                    this.drawCutMarksForGuillotine(
                                        verticalGuillotineMarks,
                                        horizontalGuillotineMarks,
                                        pageWidth,
                                        pageHeight,
                                        leftRightMargin,
                                        topBottomMargin,
                                    );
                                    verticalGuillotineMarks = [];
                                    horizontalGuillotineMarks = [];
                                }

                                this.doc.addPage();
                                for (const cardInfo of frontCards) {
                                    let x = pageWidth - cardInfo.cardX - cardWidth;
                                    let y = cardInfo.cardY;
                                    await this.drawCard(
                                        cardInfo.cardsetData,
                                        data,
                                        true,
                                        cardInfo.cardId,
                                        x,
                                        y,
                                        cardWidth,
                                        cardHeight,
                                    );
                                    verticalGuillotineMarks.push(
                                        x + (data.includeBleedingArea ? BLEED_WIDTH * PTPMM : 0),
                                    );
                                    verticalGuillotineMarks.push(
                                        x + cardWidth - (data.includeBleedingArea ? BLEED_WIDTH * PTPMM : 0),
                                    );
                                    horizontalGuillotineMarks.push(
                                        y + (data.includeBleedingArea ? BLEED_WIDTH * PTPMM : 0),
                                    );
                                    horizontalGuillotineMarks.push(
                                        y + cardHeight - (data.includeBleedingArea ? BLEED_WIDTH * PTPMM : 0),
                                    );
                                }

                                frontCards = [];
                            }

                            if (data.cutMarksForGuillotine) {
                                this.drawCutMarksForGuillotine(
                                    verticalGuillotineMarks,
                                    horizontalGuillotineMarks,
                                    pageWidth,
                                    pageHeight,
                                    leftRightMargin,
                                    topBottomMargin,
                                );

                                verticalGuillotineMarks = [];
                                horizontalGuillotineMarks = [];
                            }

                            this.doc.addPage();
                            addNewPage = false;
                        }
                        frontCards.push({ cardX, cardY, cardWidth, cardHeight, cardId, cardsetData });
                        await this.drawCard(cardsetData, data, false, cardId, cardX, cardY, cardWidth, cardHeight);

                        verticalGuillotineMarks.push(cardX + (data.includeBleedingArea ? BLEED_WIDTH * PTPMM : 0));
                        verticalGuillotineMarks.push(
                            cardX + cardWidth - (data.includeBleedingArea ? BLEED_WIDTH * PTPMM : 0),
                        );
                        horizontalGuillotineMarks.push(cardY + (data.includeBleedingArea ? BLEED_WIDTH * PTPMM : 0));
                        horizontalGuillotineMarks.push(
                            cardY + cardHeight - (data.includeBleedingArea ? BLEED_WIDTH * PTPMM : 0),
                        );

                        // Get next card position
                        cardX += cardWidth + verticalSpace;
                        if (cardX + cardWidth > pageWidth - leftRightMargin) {
                            cardX = leftRightMargin;
                            cardY += cardHeight + horizontalSpace;
                            if (cardY + cardHeight > pageHeight - topBottomMargin) {
                                cardY = topBottomMargin;
                                addNewPage = true;
                            }
                        }
                    }
                }
            }

            if (isTwoSided && frontCards.length > 0) {
                if (data.cutMarksForGuillotine) {
                    this.drawCutMarksForGuillotine(
                        verticalGuillotineMarks,
                        horizontalGuillotineMarks,
                        pageWidth,
                        pageHeight,
                        leftRightMargin,
                        topBottomMargin,
                    );

                    verticalGuillotineMarks = [];
                    horizontalGuillotineMarks = [];
                }

                this.doc.addPage();
                for (const cardInfo of frontCards) {
                    let x = pageWidth - cardInfo.cardX - cardInfo.cardWidth;
                    let y = cardInfo.cardY;
                    await this.drawCard(
                        cardInfo.cardsetData,
                        data,
                        true,
                        cardInfo.cardId,
                        x,
                        y,
                        cardInfo.cardWidth,
                        cardInfo.cardHeight,
                    );

                    verticalGuillotineMarks.push(x + (data.includeBleedingArea ? BLEED_WIDTH * PTPMM : 0));
                    verticalGuillotineMarks.push(
                        x + cardInfo.cardWidth - (data.includeBleedingArea ? BLEED_WIDTH * PTPMM : 0),
                    );
                    horizontalGuillotineMarks.push(y + (data.includeBleedingArea ? BLEED_WIDTH * PTPMM : 0));
                    horizontalGuillotineMarks.push(
                        y + cardInfo.cardHeight - (data.includeBleedingArea ? BLEED_WIDTH * PTPMM : 0),
                    );
                }

                if (data.cutMarksForGuillotine) {
                    this.drawCutMarksForGuillotine(
                        verticalGuillotineMarks,
                        horizontalGuillotineMarks,
                        pageWidth,
                        pageHeight,
                        leftRightMargin,
                        topBottomMargin,
                    );

                    verticalGuillotineMarks = [];
                    horizontalGuillotineMarks = [];
                }
            }

            this.doc.end();
            stream.on('finish', callback);
        } catch (error) {
            throw error;
        }
    };
}
