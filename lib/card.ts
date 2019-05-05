const fontkit = require('fontkit');
const { SVGPathData } = require('svg-pathdata');
const buffer = require('buffer');
import { parse, HTMLElement, NodeType } from 'node-html-parser';

const webFonts = require('./webfonts').webFonts;
import { CardSetData, ImageToDraw, ImageType } from './types';
import { makeRequest } from './requests';

// Types
// Text drawing
interface TextObjectBase {
    type: string;
}

interface TextSlice {
    type: 'slice';
    text: string;
    color: string;
    bold: boolean;
    italic: boolean;
}

interface ImageInText {
    type: 'image';
    url: string;
}

type TextObject = TextSlice | ImageInText;

interface TextOptions {
    fontFamily: string;
    fontVariant: string;
    fontSize: number;
    lineHeight: number;
    align: string;
    width: number;
    height: number;
    bold: boolean;
    italic: boolean;
}

interface TextLineGlyph {
    glyph: any;
    color: string;
    advanceWidth: number;
}

const BOLD_MAP: Record<string, string[]> = {
    '100': ['regular', '300', '500', '200', '600', '700', '800', '900'],
    '200': ['500', 'regular', '300', '600', '700', '800', '900'],
    '300': ['600', '500', '700', 'regular', '800', '900'],
    regular: ['700', '600', '800', '500', '900'],
    '500': ['800', '700', '900', '600'],
    '600': ['900', '800', '700'],
    '700': ['900', '800'],
    '800': ['900'],
    '900': ['900'],
};

const ITALIC_MAP: Record<string, string> = {
    '100': '100italic',
    '200': '200italic',
    '300': '300italic',
    regular: 'italic',
    '500': '500italic',
    '600': '600italic',
    '700': '700italic',
    '800': '800italic',
    '900': '900italic',
};

export class CardGenerator {
    serverUrl: string;
    knownFonts: Record<string, any> = {};

    constructor(serverUrl: string) {
        this.serverUrl = serverUrl;
    }

    flip(svgPath: string) {
        const pathData = new SVGPathData(svgPath);
        const flipped = pathData.matrix(1, 0, 0, -1, 0, 0).encode();

        return flipped;
    }

    async getFont(to: TextOptions) {
        const fontName = `${to.fontFamily}:${to.fontVariant}:${to.bold}:${to.italic}`;

        if (!(fontName in this.knownFonts)) {
            const webFont = webFonts[to.fontFamily];

            let fontVariant = to.fontVariant;
            if (to.bold) {
                for (const variant of BOLD_MAP[fontVariant]) {
                    if (variant in webFont) {
                        fontVariant = variant;
                    }
                }
            }

            if (to.italic) {
                if (ITALIC_MAP[fontVariant] in webFont) {
                    fontVariant = ITALIC_MAP[fontVariant];
                }
            }

            let fontUrl = webFont[fontVariant];

            fontUrl = fontUrl.replace('http://', 'https://');
            var arrayBuffer = await makeRequest(fontUrl);
            const buf = buffer.Buffer.from(arrayBuffer.data);

            let font = fontkit.create(buf);
            this.knownFonts[fontName] = font;
        }

        return this.knownFonts[fontName];
    }

    async drawTextLine(textLine: TextLineGlyph[], textOptions: TextOptions, yPos: number): Promise<ImageToDraw[]> {
        let imagesToDraw: ImageToDraw[] = [];

        const lineWidth = textLine.map(l => l.advanceWidth).reduce((a, b) => a + b, 0);

        const font = await this.getFont(textOptions);
        const fontHeight = (font.hhea.ascent - font.hhea.descent) / font.head.unitsPerEm;
        const addOn = (textOptions.lineHeight - fontHeight) / 2;
        const ascent = (addOn + font.hhea.ascent / font.head.unitsPerEm) * textOptions.fontSize;

        let lineY = yPos + ascent;
        let lineX = 0;

        if (textOptions.align === 'center') {
            lineX += (textOptions.width - lineWidth) / 2;
        } else if (textOptions.align === 'right') {
            lineX += textOptions.width - lineWidth;
        }

        const scale = (1.0 / font.head.unitsPerEm) * textOptions.fontSize;

        for (const tlg of textLine) {
            if (!tlg.glyph.url) {
                const flipped = this.flip(tlg.glyph.path.toSVG());
                imagesToDraw.push({
                    x: lineX,
                    y: lineY,
                    width: tlg.advanceWidth,
                    height: textOptions.fontSize,
                    type: ImageType.SVG_PATH,
                    data: flipped,
                    color: tlg.color,
                    scale,
                    angle: 0,
                });
            } else {
                imagesToDraw.push({
                    x: lineX,
                    y: lineY - textOptions.fontSize,
                    angle: 0,
                    width: textOptions.fontSize,
                    height: textOptions.fontSize,
                    type: ImageType.IMAGE,
                    data: tlg.glyph.url,
                });
            }

            lineX += tlg.advanceWidth;
        }

        return imagesToDraw;
    }

    async drawTextSliceBlock(
        lineToDraw: TextLineGlyph[],
        lineWidth: number,
        joinedObjects: { chr: string; textObject: TextObject }[],
        textOptions: TextOptions,
        yPos: number,
    ): Promise<{ lineToDraw: TextLineGlyph[]; lineWidth: number; yPos: number; imagesToDraw: ImageToDraw[] }> {
        let imagesToDraw: ImageToDraw[] = [];

        if (joinedObjects.length === 0) {
            return { lineToDraw, lineWidth, yPos, imagesToDraw };
        }

        const font = await this.getFont(textOptions);
        let glyphs = [];
        if (joinedObjects[0].textObject.type === 'slice') {
            let run = font.layout(joinedObjects.map(i => i.chr).join(''));
            glyphs = run.glyphs;
        } else if (joinedObjects[0].textObject.type === 'image') {
            for (const obj of joinedObjects) {
                if (obj.textObject.type === 'image') {
                    glyphs.push({
                        url: obj.textObject.url,
                        advanceWidth: font.head.unitsPerEm,
                    });
                }
            }
        }

        let charNo = 0;
        let lastSpace = -1;
        for (let glyph of glyphs) {
            let advanceWidth = (glyph.advanceWidth / font.head.unitsPerEm) * textOptions.fontSize;

            const obj = joinedObjects[charNo].textObject;
            lineToDraw.push({ glyph, color: obj.type === 'slice' ? obj.color : '#000000', advanceWidth });

            if (lineToDraw.length > 1 && joinedObjects[charNo].chr === ' ') {
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

                let result = await this.drawTextLine(partToDraw, textOptions, yPos);
                imagesToDraw = imagesToDraw.concat(result);
                lineWidth = lineToDraw.map(l => l.advanceWidth).reduce((a, b) => a + b, 0);
                lastSpace = -1;

                yPos += textOptions.fontSize * textOptions.lineHeight; // Move cursor one text line down
            }

            charNo++;
        }

        return { lineToDraw, lineWidth, imagesToDraw, yPos };
    }

    async drawTextObjects(
        textObjects: TextObject[],
        textOptions: TextOptions,
        yPos: number,
    ): Promise<{ imagesToDraw: ImageToDraw[]; yPos: number }> {
        let imagesToDraw: ImageToDraw[] = [];

        if (textObjects.length === 0) {
            return { imagesToDraw: [], yPos };
        }

        let currentBold = false;
        let currentItalic = false;
        let currentType = 'slice';
        let joinedObjects: { chr: string; textObject: TextObject }[] = [];

        let lineToDraw: TextLineGlyph[] = [];
        let lineWidth = 0;

        for (let idx = 0; idx < textObjects.length; idx++) {
            const textObject = textObjects[idx];

            if (textObject.type === 'slice' && currentBold === undefined) {
                currentBold = textObject.bold;
                currentItalic = textObject.italic;
            }

            if (
                currentType !== textObject.type ||
                (textObject.type === 'slice' &&
                    (currentBold !== textObject.bold || currentItalic !== textObject.italic))
            ) {
                let result = await this.drawTextSliceBlock(
                    lineToDraw,
                    lineWidth,
                    joinedObjects,
                    {
                        ...textOptions,
                        bold: currentBold,
                        italic: currentItalic,
                    },
                    yPos,
                );

                lineToDraw = result.lineToDraw;
                lineWidth = result.lineWidth;
                imagesToDraw = imagesToDraw.concat(result.imagesToDraw);
                yPos = result.yPos;

                if (textObject.type === 'slice') {
                    currentBold = textObject.bold;
                    currentItalic = textObject.italic;
                }
                currentType = textObject.type;
                joinedObjects = [];
            }

            if (textObject.type === 'slice') {
                for (const chr of textObject.text) {
                    joinedObjects.push({ chr, textObject });
                }
            } else if (textObject.type === 'image') {
                joinedObjects.push({ chr: '', textObject });
            }
        }

        if (joinedObjects.length > 0) {
            let result = await this.drawTextSliceBlock(
                lineToDraw,
                lineWidth,
                joinedObjects,
                {
                    ...textOptions,
                    bold: currentBold,
                    italic: currentItalic,
                },
                yPos,
            );
            lineToDraw = result.lineToDraw;
            lineWidth = result.lineWidth;
            imagesToDraw = imagesToDraw.concat(result.imagesToDraw);
            yPos = result.yPos;
        }

        if (lineToDraw.length > 0) {
            let result = await this.drawTextLine(lineToDraw, textOptions, yPos);
            imagesToDraw = imagesToDraw.concat(result);
            yPos += textOptions.fontSize * textOptions.lineHeight; // Move cursor one text line down
        }

        return { imagesToDraw, yPos };
    }

    async drawText(
        node: HTMLElement,
        color: string,
        textOptions: TextOptions,
        yPos: number,
    ): Promise<{ textObjects: TextObject[]; imagesToDraw: ImageToDraw[]; yPos: number }> {
        let textObjects: TextObject[] = [];
        let imagesToDraw: ImageToDraw[] = [];
        if (node.nodeType !== NodeType.ELEMENT_NODE) {
            return { textObjects, imagesToDraw, yPos };
        }

        for (const child of node.childNodes) {
            if (child.nodeType === NodeType.TEXT_NODE) {
                textObjects.push({
                    type: 'slice',
                    text: child.text,
                    color,
                    bold: textOptions.bold,
                    italic: textOptions.italic,
                });
            } else if (child.nodeType === NodeType.ELEMENT_NODE) {
                const element = child as HTMLElement;

                if (element.tagName === 'img') {
                    textObjects.push({
                        type: 'image',
                        url: element.attributes['src'],
                    });
                } else {
                    let newColor = color;
                    if (element.tagName === 'font' && 'color' in element.attributes) {
                        newColor = element.attributes['color'];
                    }
                    const newTextOptions = { ...textOptions };
                    if (element.tagName === 'b') {
                        newTextOptions.bold = true;
                    }
                    if (element.tagName === 'i') {
                        newTextOptions.italic = true;
                    }

                    if (element.tagName === 'div') {
                        // Draw text before this div
                        let drawResult = await this.drawTextObjects(textObjects, textOptions, yPos);
                        imagesToDraw = imagesToDraw.concat(drawResult.imagesToDraw);
                        yPos = drawResult.yPos;

                        if ('align' in element.attributes) {
                            newTextOptions.align = element.attributes['align'];
                        } else if ('style' in element.attributes) {
                            if (element.attributes['style'] === 'text-align: right;') {
                                newTextOptions.align = 'right';
                            } else if (element.attributes['style'] === 'text-align: center;') {
                                newTextOptions.align = 'center';
                            }
                        }

                        let result = await this.drawText(element, newColor, newTextOptions, yPos);
                        textObjects = result.textObjects;
                        yPos = result.yPos;
                        imagesToDraw = imagesToDraw.concat(result.imagesToDraw);
                    } else {
                        let result = await this.drawText(element, newColor, newTextOptions, yPos);
                        textObjects = textObjects.concat(result.textObjects);
                        yPos = result.yPos;
                        imagesToDraw = imagesToDraw.concat(result.imagesToDraw);
                    }
                }
            }
        }

        if (node.tagName === 'div') {
            let result = await this.drawTextObjects(textObjects, textOptions, yPos);
            imagesToDraw = imagesToDraw.concat(result.imagesToDraw);
            yPos = result.yPos;
            return { textObjects: [], imagesToDraw, yPos };
        }
        return { textObjects, imagesToDraw, yPos };
    }

    async *processCard(data: CardSetData, cardId: string, isBack: boolean): AsyncIterableIterator<ImageToDraw> {
        const cardImages = data.images[cardId];
        const cardTexts = data.texts[cardId];

        for (const placeholderId of data.placeholdersAllIds) {
            const placeholder = data.placeholders[placeholderId];
            if ((placeholder.isOnBack || false) !== isBack) {
                continue;
            }

            if (placeholder.type === 'image' && cardImages) {
                const imageInfo = cardImages[placeholderId];

                if (imageInfo === undefined) continue;

                let result = {
                    x: placeholder.x,
                    y: placeholder.y,
                    angle: placeholder.angle,
                    width: placeholder.width,
                    height: placeholder.height,
                    fit: placeholder.fit,
                };

                if (imageInfo.base64) {
                    const svg = Buffer.from(imageInfo.base64, 'base64');
                    yield {
                        ...result,
                        type: ImageType.SVG,
                        data: svg,
                    };
                } else if (imageInfo.url) {
                    try {
                        yield {
                            ...result,
                            type: ImageType.IMAGE,
                            data: imageInfo.url,
                        };
                    } catch {
                        // TODO: handle error here
                    }
                }
            } else if (placeholder.type === 'text' && cardTexts) {
                const textInfo = cardTexts[placeholderId];

                if (textInfo === undefined) continue;

                let text = `<div>${textInfo.value.replace(/<br>/g, '<br/>')}</div>`;
                let parsedText = parse('<div></div>');
                try {
                    parsedText = parse(text);
                } catch (error) {
                    // TODO: we should do something with errors like this one
                }

                let fontSize = placeholder.fontSize;

                const textOptions: TextOptions = {
                    fontFamily: placeholder.fontFamily,
                    fontVariant: placeholder.fontVariant,
                    fontSize,
                    lineHeight: placeholder.lineHeight || 1.27,
                    align: placeholder.align,
                    width: placeholder.width,
                    height: placeholder.height,
                    bold: false,
                    italic: false,
                };
                let result = await this.drawText(parsedText as HTMLElement, placeholder.color, textOptions, 0);

                yield {
                    type: ImageType.BLOCK_START,
                    x: placeholder.x,
                    y: placeholder.y,
                    angle: placeholder.angle,
                    width: placeholder.width,
                    height: placeholder.height,
                    data: '',
                };

                for (const image of result.imagesToDraw) {
                    yield image;
                }

                yield {
                    type: ImageType.BLOCK_END,
                    x: placeholder.x,
                    y: placeholder.y,
                    angle: placeholder.angle,
                    width: placeholder.width,
                    height: placeholder.height,
                    data: '',
                };
            }
        }
    }
}
