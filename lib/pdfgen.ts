import PDFDocument = require('pdfkit');

import { CardSetData, JobData, ImageType, ImageToDraw } from './types';

const SVGtoPDF = require('svg-to-pdfkit');

import { makeAuthRequest } from './requests';
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
                .stroke('#ccc');

            this.doc
                .moveTo(x, pageHeight)
                .lineTo(x, pageHeight - topBottomMargin / 2)
                .lineWidth(0.1 * PTPMM)
                .stroke('#ccc');
        }

        for (const y of horizontalGuillotineMarks) {
            this.doc
                .moveTo(0, y)
                .lineTo(leftRightMargin / 2, y)
                .lineWidth(0.1 * PTPMM)
                .stroke('#ccc');

            this.doc
                .moveTo(pageWidth, y)
                .lineTo(pageWidth - leftRightMargin / 2, y)
                .lineWidth(0.1 * PTPMM)
                .stroke('#ccc');
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

    async drawGuillotineCutLines(cardX: number, cardY: number, cardWidth: number, cardHeight: number) {
        this.doc.save();
        this.doc
            .moveTo(cardX, cardY)
            .lineTo(cardX + 2 * PTPMM, cardY)
            .lineWidth(0.1 * PTPMM)
            .stroke('#ccc');
        this.doc
            .moveTo(cardX, cardY)
            .lineTo(cardX, cardY + 2 * PTPMM)
            .lineWidth(0.1 * PTPMM)
            .stroke('#ccc');

        this.doc
            .moveTo(cardX + cardWidth, cardY)
            .lineTo(cardX + cardWidth - 2 * PTPMM, cardY)
            .lineWidth(0.1 * PTPMM)
            .stroke('#ccc');
        this.doc
            .moveTo(cardX + cardWidth, cardY)
            .lineTo(cardX + cardWidth, cardY + 2 * PTPMM)
            .lineWidth(0.1 * PTPMM)
            .stroke('#ccc');

        this.doc
            .moveTo(cardX + cardWidth, cardY + cardHeight)
            .lineTo(cardX + cardWidth - 2 * PTPMM, cardY + cardHeight)
            .lineWidth(0.1 * PTPMM)
            .stroke('#ccc');
        this.doc
            .moveTo(cardX + cardWidth, cardY + cardHeight)
            .lineTo(cardX + cardWidth, cardY + cardHeight - 2 * PTPMM)
            .lineWidth(0.1 * PTPMM)
            .stroke('#ccc');

        this.doc
            .moveTo(cardX, cardY + cardHeight)
            .lineTo(cardX + 2 * PTPMM, cardY + cardHeight)
            .lineWidth(0.1 * PTPMM)
            .stroke('#ccc');
        this.doc
            .moveTo(cardX, cardY + cardHeight)
            .lineTo(cardX, cardY + cardHeight - 2 * PTPMM)
            .lineWidth(0.1 * PTPMM)
            .stroke('#ccc');

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
        this.doc.save();
        this.doc.transform(PTPMM, 0, 0, 0, PTPMM, 0);

        this.doc.rect(cardX, cardY, cardWidth, cardHeight).clip();
        if (!jobData.includeBleedingArea) {
            this.doc.translate(-BLEED_WIDTH, -BLEED_WIDTH);
        }

        this.doc.translate(cardX, cardY);

        const cardGen = new CardGenerator(this.serverUrl);
        for await (const imageToDraw of cardGen.processCard(data, cardId, isBack)) {
            if (imageToDraw.type === ImageType.SVG) {
                this.prepareImageToDrawSpace(imageToDraw);
                SVGtoPDF(this.doc, imageToDraw.data.toString(), 0, 0, {
                    width: imageToDraw.width * PTPMM,
                    height: imageToDraw.height * PTPMM,
                    preserveAspectRatio:
                        imageToDraw.fit === 'stretch'
                            ? 'none'
                            : imageToDraw.fit === 'height'
                            ? 'xMinYMid slice'
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
                this.doc.image(imageToDraw.data, 0, 0, {
                    width:
                        !imageToDraw.fit || imageToDraw.fit === 'width' || imageToDraw.fit === 'stretch'
                            ? imageToDraw.width
                            : undefined,
                    height:
                        imageToDraw.fit === 'height' || imageToDraw.fit === 'stretch' ? imageToDraw.height : undefined,
                });
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
                );
            }
        }
    }

    // PDF generation

    generatePdf = async (data: JobData, serverUrl: string, outStream: NodeJS.WritableStream, callback: () => void) => {
        try {
            let cardsets: CardSetData[] = [];
            this.serverUrl = serverUrl;

            // Get Card Sets
            if (data.collectionType === 'games') {
                let resp = await makeAuthRequest(
                    `${this.serverUrl}/api/${data.collectionType}/${data.collectionId}`,
                    data.accessToken,
                );
                const cardsetsList = resp.data.cardsets;
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
                                    verticalGuillotineMarks.push(
                                        x + (data.includeBleedingArea ? BLEED_WIDTH * PTPMM : 0),
                                    );
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

                            if (data.cutMarksForGuillotine && (!isTwoSided || !data.cutMarksOnFrontSideOnly)) {
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
                if (data.cutMarksForGuillotine && !data.cutMarksOnFrontSideOnly) {
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

                if (data.cutMarksForGuillotine && (!isTwoSided || !data.cutMarksOnFrontSideOnly)) {
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
