import PDFDocument = require('pdfkit');
import * as buffer from 'buffer';
const SVGtoPDF = require('svg-to-pdfkit');

import { CardSetData, PdfJobData, ImageType, ImageToDraw } from './types';
import { makeAuthRequest, makeRequest } from './requests';
import { CardGenerator } from './card';

// Constants
export const BLEED_WIDTH = 25.4 / 8; // 1/8th of inch in mm

// PDF Generator

const PTPMM = 72 / 25.4;

export class PDFGenerator {
    doc: PDFKit.PDFDocument = new PDFDocument();
    serverUrl: string = '';

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

    async drawGuillotineCutLines(
        cardX: number,
        cardY: number,
        cardWidth: number,
        cardHeight: number,
        intoBleedArea: boolean,
    ) {
        let m = intoBleedArea ? -1 : 1;

        this.doc.save();
        for (const x of [0, 1]) {
            let dx = x === 0 ? 1 : -1;

            for (const y of [0, 1]) {
                let dy = y === 0 ? 1 : -1;
                let sx = cardX + cardWidth * x;
                let sy = cardY + cardHeight * y;
                let ex1 = cardX + cardWidth * x + dx * 2 * PTPMM;
                let ey1 = sy;
                let ex2 = sx;
                let ey2 = cardY + cardHeight * y + m * dy * 2 * PTPMM;

                this.doc
                    .moveTo(sx, sy)
                    .lineTo(ex1, ey1)
                    .lineWidth(0.1 * PTPMM)
                    .stroke('#FFFFFF');
                this.doc
                    .moveTo(sx, sy)
                    .lineTo(ex1, ey1)
                    .lineWidth(0.1 * PTPMM)
                    .dash(0.3 * PTPMM, {})
                    .stroke('#000000');

                this.doc
                    .moveTo(sx, sy)
                    .lineTo(ex2, ey2)
                    .lineWidth(0.1 * PTPMM)
                    .stroke('#FFFFFF');
                this.doc
                    .moveTo(sx, sy)
                    .lineTo(ex2, ey2)
                    .lineWidth(0.1 * PTPMM)
                    .dash(0.3 * PTPMM, {})
                    .stroke('#000000');
            }
        }

        this.doc.restore();
    }

    prepareImageToDrawSpace(imageToDraw: ImageToDraw) {
        this.doc.save();
        this.doc.translate(
            (imageToDraw.x + imageToDraw.width / 2) * PTPMM,
            (imageToDraw.y + imageToDraw.height / 2) * PTPMM,
        );
        this.doc.rotate((imageToDraw.angle * 180) / Math.PI);
        this.doc.translate((-imageToDraw.width / 2) * PTPMM, (-imageToDraw.height / 2) * PTPMM);
        if (imageToDraw.crop) {
            this.doc.rect(0, 0, imageToDraw.width * PTPMM, imageToDraw.height * PTPMM).clip();
        }
    }

    calculateImageDimensions(imageFieldInfo: ImageToDraw) {
        let { fit, imageWidth, imageHeight } = imageFieldInfo;
        imageWidth = imageWidth || 1;
        imageHeight = imageHeight || 1;

        let calculatedImageWidth, calculatedImageHeight;
        if (!imageFieldInfo.fit || imageFieldInfo.fit === 'width') {
            calculatedImageWidth = imageFieldInfo.width * PTPMM;
            calculatedImageHeight = ((imageFieldInfo.width * imageHeight) / imageWidth) * PTPMM;
        } else if (imageFieldInfo.fit === 'height') {
            calculatedImageWidth = ((imageFieldInfo.height * imageWidth) / imageHeight) * PTPMM;
            calculatedImageHeight = imageFieldInfo.height * PTPMM;
        } else {
            // strech
            calculatedImageWidth = imageFieldInfo.width * PTPMM;
            calculatedImageHeight = imageFieldInfo.height * PTPMM;
        }

        calculatedImageWidth *= imageFieldInfo.zoom || 1;
        calculatedImageHeight *= imageFieldInfo.zoom || 1;
        return { width: calculatedImageWidth, height: calculatedImageHeight };
    }

    async drawCard(
        data: CardSetData,
        jobData: PdfJobData,
        isBack: boolean,
        cardId: string,
        cardX: number,
        cardY: number,
        cardWidth: number,
        cardHeight: number,
    ) {
        this.doc.save();

        this.doc.rect(cardX, cardY, cardWidth, cardHeight).clip();
        if (!jobData.includeBleedingArea) {
            this.doc.translate(-BLEED_WIDTH * PTPMM, -BLEED_WIDTH * PTPMM);
        }

        this.doc.translate(cardX, cardY);

        const cardGen = new CardGenerator(this.serverUrl);
        for await (const imageToDraw of cardGen.processCard(data, cardId, isBack)) {
            if (imageToDraw.type === ImageType.SVG) {
                this.prepareImageToDrawSpace(imageToDraw);
                if (imageToDraw.cx !== undefined && imageToDraw.cy !== undefined) {
                    this.doc.translate(imageToDraw.cx * PTPMM, imageToDraw.cy * PTPMM);
                }
                let dim = this.calculateImageDimensions(imageToDraw);

                const svg = buffer.Buffer.from(imageToDraw.data, 'base64').toString();
                SVGtoPDF(this.doc, svg, 0, 0, {
                    width: dim.width,
                    height: dim.height,
                    preserveAspectRatio:
                        imageToDraw.fit === 'stretch'
                            ? 'none'
                            : imageToDraw.fit === 'height'
                            ? 'xMinYMid meet'
                            : 'xMidYMin meet',
                });
                this.doc.restore();
            } else if (imageToDraw.type === ImageType.SVG_PATH) {
                this.prepareImageToDrawSpace(imageToDraw);
                if (imageToDraw.scale && imageToDraw.color) {
                    this.doc.scale(imageToDraw.scale * PTPMM, imageToDraw.scale * PTPMM);
                    this.doc.fillColor(imageToDraw.color);
                    this.doc.path(imageToDraw.data).fill();
                }
                this.doc.restore();
            } else if (imageToDraw.type === ImageType.IMAGE) {
                this.prepareImageToDrawSpace(imageToDraw);
                if (imageToDraw.cx !== undefined && imageToDraw.cy !== undefined) {
                    this.doc.translate(imageToDraw.cx * PTPMM, imageToDraw.cy * PTPMM);
                }
                let dim = this.calculateImageDimensions(imageToDraw);

                let url = imageToDraw.data;
                if (!url.startsWith('http')) {
                    url = this.serverUrl + url;
                }
                let resp = await makeRequest(url);
                const buf = buffer.Buffer.from(resp.data);

                if (resp.headers['content-type'] === 'image/svg+xml') {
                    SVGtoPDF(this.doc, buf.toString(), 0, 0, {
                        width: dim.width,
                        height: dim.height,
                        preserveAspectRatio:
                            imageToDraw.fit === 'stretch'
                                ? 'none'
                                : imageToDraw.fit === 'height'
                                ? 'xMinYMid meet'
                                : 'xMidYMin meet',
                    });
                } else {
                    this.doc.image(buf, 0, 0, {
                        width: dim.width,
                        height: dim.height,
                    });
                }
                this.doc.restore();
            } else if (imageToDraw.type === ImageType.BLOCK_START) {
                this.prepareImageToDrawSpace(imageToDraw);
            } else if (imageToDraw.type === ImageType.BLOCK_END) {
                this.doc.restore();
            }
        }

        this.doc.restore();

        if (!jobData.cutMarksOnFrontSideOnly || !isBack) {
            if (jobData.cutMarksForScissors) {
                await this.drawCutLines(
                    cardX + (jobData.includeBleedingArea ? BLEED_WIDTH * PTPMM : 0),
                    cardY + (jobData.includeBleedingArea ? BLEED_WIDTH * PTPMM : 0),
                    cardWidth - (jobData.includeBleedingArea ? BLEED_WIDTH * 2 * PTPMM : 0),
                    cardHeight - (jobData.includeBleedingArea ? BLEED_WIDTH * 2 * PTPMM : 0),
                );
            } else if (jobData.cutMarksForGuillotine) {
                await this.drawGuillotineCutLines(
                    cardX + (jobData.includeBleedingArea ? BLEED_WIDTH * PTPMM : 0),
                    cardY + (jobData.includeBleedingArea ? BLEED_WIDTH * PTPMM : 0),
                    cardWidth - (jobData.includeBleedingArea ? BLEED_WIDTH * 2 * PTPMM : 0),
                    cardHeight - (jobData.includeBleedingArea ? BLEED_WIDTH * 2 * PTPMM : 0),
                    jobData.includeBleedingArea,
                );
            }
        }
    }

    // PDF generation

    generatePdf = async (
        data: PdfJobData,
        serverUrl: string,
        outStream: NodeJS.WritableStream,
        callback: () => void,
    ) => {
        let cardsets: CardSetData[] = [];
        this.serverUrl = serverUrl;

        // Get Card Sets
        if (data.collectionType === 'games') {
            let resp = await makeAuthRequest(
                `${this.serverUrl}/api/${data.collectionType}/${data.collectionId}`,
                data.accessToken,
            );
            let cardsetsList = resp.data.cardsets;
            cardsetsList.sort((a: any, b: any) => (a.name < b.name ? -1 : 1));

            for (const cardsetInfo of cardsetsList) {
                resp = await makeAuthRequest(`${this.serverUrl}/api/cardsets/${cardsetInfo.id}`, data.accessToken);
                let cardsetData: CardSetData = JSON.parse(resp.data.data);
                cardsets.push(cardsetData);
            }
        } else {
            let resp = await makeAuthRequest(
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
                return Promise.reject(
                    'Cards do not fit in the page (height and margins are larger then page height). Reduce margins or card size.',
                );
            }

            if (data.leftRightMargin * 2 + cardsetData.width > data.pageWidth) {
                return Promise.reject(
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
                            if (data.cutMarksInMarginArea) {
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
                                horizontalGuillotineMarks.push(
                                    y + (data.includeBleedingArea ? BLEED_WIDTH * PTPMM : 0),
                                );
                                horizontalGuillotineMarks.push(
                                    y + cardInfo.cardHeight - (data.includeBleedingArea ? BLEED_WIDTH * PTPMM : 0),
                                );
                            }

                            frontCards = [];
                        }

                        if (data.cutMarksInMarginArea && (!isTwoSided || !data.cutMarksOnFrontSideOnly)) {
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

        if (data.cutMarksInMarginArea) {
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

        if (isTwoSided && frontCards.length > 0) {
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

            if (data.cutMarksInMarginArea && (!isTwoSided || !data.cutMarksOnFrontSideOnly)) {
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
    };
}
