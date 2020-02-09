const fontkit = require('fontkit');
const { SVGPathData } = require('svg-pathdata');
const buffer = require('buffer');
import { parse, HTMLElement } from 'node-html-parser';

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
    width: number;
    height: number;
}

interface LineBreak {
    type: 'br';
}

interface CarriageReturn {
    type: 'cr';
}

type TextObject = TextSlice | ImageInText | LineBreak | CarriageReturn;

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
    textOptions: TextOptions;
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

    lineToDraw: TextLineGlyph[] = [];
    lineWidth = 0;
    yPos = 0;
    imagesToDraw: ImageToDraw[] = [];

    async drawTextLine() {
        if (this.lineToDraw.length <= 0) {
            return;
        }
        let textOptions = this.lineToDraw[0].textOptions;

        const lineWidth = this.lineToDraw.map(l => l.advanceWidth).reduce((a, b) => a + b, 0);

        const font = await this.getFont(textOptions);
        const fontHeight = (font.hhea.ascent - font.hhea.descent) / font.head.unitsPerEm;
        const addOn = (textOptions.lineHeight - fontHeight) / 2;
        const ascent = (addOn + font.hhea.ascent / font.head.unitsPerEm) * textOptions.fontSize;

        let lineY = this.yPos + ascent;
        let lineX = 0;

        if (textOptions.align === 'center') {
            lineX += (textOptions.width - lineWidth) / 2;
        } else if (textOptions.align === 'right') {
            lineX += textOptions.width - lineWidth;
        }

        const scale = (1.0 / font.head.unitsPerEm) * textOptions.fontSize;

        for (const tlg of this.lineToDraw) {
            if (!tlg.glyph.url) {
                const flipped = this.flip(tlg.glyph.path.toSVG());
                this.imagesToDraw.push({
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
                this.imagesToDraw.push({
                    x: lineX,
                    y: lineY - textOptions.fontSize,
                    angle: 0,
                    width: textOptions.fontSize * tlg.glyph.ratio,
                    height: textOptions.fontSize,
                    imageWidth: textOptions.fontSize * tlg.glyph.ratio,
                    imageHeight: textOptions.fontSize,
                    type: ImageType.IMAGE,
                    data: tlg.glyph.url,
                });
            }

            lineX += tlg.advanceWidth;
        }

        this.lineToDraw = [];
        this.lineWidth = 0;
    }

    async drawJoinedObjects(joinedObjects: { chr: string; textObject: TextObject }[], textOptions: TextOptions) {
        if (joinedObjects.length === 0) {
            return;
        }

        const font = await this.getFont(textOptions);
        let glyphs = [];
        if (joinedObjects[0].textObject.type === 'slice') {
            let run = font.layout(joinedObjects.map(i => i.chr).join(''));
            glyphs = run.glyphs;
        } else if (joinedObjects[0].textObject.type === 'image') {
            for (const obj of joinedObjects) {
                if (obj.textObject.type === 'image') {
                    let width = obj.textObject.width;
                    let height = obj.textObject.height;
                    let ratio = width / height;

                    glyphs.push({
                        url: obj.textObject.url,
                        advanceWidth: font.head.unitsPerEm * ratio,
                        ratio,
                    });
                }
            }
        }

        let charNo = 0;
        let lastSpace = -1;
        for (let glyph of glyphs) {
            let advanceWidth = (glyph.advanceWidth / font.head.unitsPerEm) * textOptions.fontSize;

            const obj = joinedObjects[charNo].textObject;
            this.lineToDraw.push({
                glyph,
                color: obj.type === 'slice' ? obj.color : '#000000',
                advanceWidth,
                textOptions,
            });

            if (this.lineToDraw.length > 1 && glyph.codePoints && glyph.codePoints.includes(32)) {
                lastSpace = this.lineToDraw.length - 1;
            }

            this.lineWidth += advanceWidth;
            if (this.lineWidth > textOptions.width) {
                let remainder: TextLineGlyph[] = [];

                if (lastSpace !== -1) {
                    remainder = this.lineToDraw.splice(lastSpace + 1);
                    this.lineToDraw = this.lineToDraw.splice(0, lastSpace);
                } else {
                    remainder = this.lineToDraw.splice(this.lineToDraw.length - 1);
                    this.lineToDraw = this.lineToDraw.splice(0, this.lineToDraw.length - 1);
                }

                let result = await this.drawTextLine();

                this.lineToDraw = remainder;
                this.lineWidth = this.lineToDraw.map(l => l.advanceWidth).reduce((a, b) => a + b, 0);
                lastSpace = -1;

                this.yPos += textOptions.fontSize * textOptions.lineHeight; // Move cursor one text line down
            }

            charNo += glyph.codePoints ? Math.max(glyph.codePoints.length, 1) : 1;
        }
    }

    async drawTextObjects(textObjects: TextObject[], textOptions: TextOptions): Promise<ImageToDraw[]> {
        if (textObjects.length === 0) {
            return [];
        }

        this.imagesToDraw = [];

        let firstObject = textObjects[0];
        let currentBold = firstObject.type === 'slice' ? firstObject.bold : false;
        let currentItalic = firstObject.type === 'slice' ? firstObject.italic : false;
        let currentType = firstObject.type;
        let isNewLine = true;
        let joinedObjects: { chr: string; textObject: TextObject }[] = [];

        this.lineToDraw = [];
        this.lineWidth = 0;
        this.yPos = 0;

        for (const textObject of textObjects) {
            if (
                currentType !== textObject.type ||
                (textObject.type === 'slice' &&
                    (currentBold !== textObject.bold || currentItalic !== textObject.italic))
            ) {
                let result = await this.drawJoinedObjects(joinedObjects, {
                    ...textOptions,
                    bold: currentBold,
                    italic: currentItalic,
                });

                currentType = textObject.type;
                joinedObjects = [];
            }

            if (textObject.type === 'slice') {
                currentBold = textObject.bold;
                currentItalic = textObject.italic;
                for (const chr of textObject.text) {
                    joinedObjects.push({ chr, textObject });
                }
                isNewLine = false;
            } else if (textObject.type === 'image') {
                joinedObjects.push({ chr: '', textObject });
                isNewLine = false;
            } else if (textObject.type === 'cr') {
                if (!isNewLine) {
                    await this.drawTextLine();
                    this.yPos += textOptions.fontSize * textOptions.lineHeight; // Move cursor one text line down
                }
                isNewLine = true;
            } else if (textObject.type === 'br') {
                await this.drawTextLine();
                this.yPos += textOptions.fontSize * textOptions.lineHeight; // Move cursor one text line down
                isNewLine = true;
            }
        }

        if (joinedObjects.length > 0) {
            let result = await this.drawJoinedObjects(joinedObjects, {
                ...textOptions,
                bold: currentBold,
                italic: currentItalic,
            });
        }

        await this.drawTextLine();

        return this.imagesToDraw;
    }

    toInt(field: string): number {
        if (field === undefined) {
            return 1;
        }

        let val = parseInt(field, 10);
        if (!val || isNaN(val)) {
            val = 1;
        }

        return val;
    }

    collectTextObjects(node: HTMLElement, color: string, textOptions: TextOptions): TextObject[] {
        let textObjects: TextObject[] = [];
        if (node.nodeType !== 1 /* ELEMENT_NODE */) {
            return textObjects;
        }

        for (const child of node.childNodes) {
            if (child.nodeType === 3 /* TEXT_NODE */) {
                textObjects.push({
                    type: 'slice',
                    text: child.text,
                    color,
                    bold: textOptions.bold,
                    italic: textOptions.italic,
                });
            } else if (child.nodeType === 1 /* ELEMENT_NODE */) {
                const element = child as HTMLElement;

                if (element.tagName === 'img') {
                    textObjects.push({
                        type: 'image',
                        url: element.attributes['src'],
                        width: this.toInt(element.attributes['data-width']),
                        height: this.toInt(element.attributes['data-height']),
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

                    if (element.tagName === 'br') {
                        textObjects.push({
                            type: 'br',
                        });
                    }

                    if (element.tagName === 'div') {
                        textObjects.push({
                            type: 'cr',
                        });

                        if ('align' in element.attributes) {
                            newTextOptions.align = element.attributes['align'];
                        } else if ('style' in element.attributes) {
                            if (element.attributes['style'] === 'text-align: right;') {
                                newTextOptions.align = 'right';
                            } else if (element.attributes['style'] === 'text-align: center;') {
                                newTextOptions.align = 'center';
                            }
                        }
                    }

                    let result = this.collectTextObjects(element, newColor, newTextOptions);
                    textObjects = textObjects.concat(result);
                }
            }
        }

        return textObjects;
    }

    async drawText(node: HTMLElement, color: string, textOptions: TextOptions): Promise<ImageToDraw[]> {
        let textObjects = this.collectTextObjects(node, color, textOptions);
        return await this.drawTextObjects(textObjects, textOptions);
    }

    async *processCard(data: CardSetData, cardId: string, isBack: boolean): AsyncIterableIterator<ImageToDraw> {
        if (!('fieldsAllIds' in data)) {
            return;
        }

        for (const fieldId of data.fieldsAllIds) {
            const field = data.fields[cardId][fieldId];
            if ((field.isOnBack || false) !== isBack) {
                continue;
            }

            if (field.type === 'image') {
                let result = {
                    x: field.x,
                    y: field.y,
                    angle: field.angle,
                    width: field.width,
                    height: field.height,
                    fit: field.fit,
                    imageWidth: field.imageWidth,
                    imageHeight: field.imageHeight,
                    zoom: field.zoom,
                    cx: field.cx,
                    cy: field.cy,
                    crop: field.crop,
                };

                if (field.base64) {
                    yield {
                        ...result,
                        type: ImageType.SVG,
                        data: field.base64,
                    };
                } else if (field.url) {
                    try {
                        yield {
                            ...result,
                            type: ImageType.IMAGE,
                            data: field.url,
                        };
                    } catch {
                        // TODO: handle error here
                    }
                }
            } else if (field.type === 'text') {
                let text = `<div>${field.value.replace(/<br>/g, '<br/>')}</div>`;
                let parsedText = parse('<div></div>');
                try {
                    parsedText = parse(text);
                } catch (error) {
                    // TODO: we should do something with errors like this one
                }

                let fontSize = field.fontSize;

                const textOptions: TextOptions = {
                    fontFamily: field.fontFamily,
                    fontVariant: field.fontVariant,
                    fontSize,
                    lineHeight: field.lineHeight || 1.27,
                    align: field.align,
                    width: field.width,
                    height: field.height,
                    bold: false,
                    italic: false,
                };
                let result = await this.drawText(parsedText as HTMLElement, field.color, textOptions);

                yield {
                    type: ImageType.BLOCK_START,
                    x: field.x,
                    y: field.y,
                    angle: field.angle,
                    width: field.width,
                    height: field.height,
                    data: '',
                };

                for (const image of result) {
                    yield image;
                }

                yield {
                    type: ImageType.BLOCK_END,
                    x: field.x,
                    y: field.y,
                    angle: field.angle,
                    width: field.width,
                    height: field.height,
                    data: '',
                };
            }
        }
    }
}
