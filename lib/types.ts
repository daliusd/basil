// XXX: Careful! Code duplication here. If you change types or constants in saffron then change here as well.

export interface CardType {
    id: string;
    count: number;
}

export interface CardsCollection {
    [propName: string]: CardType;
}

export interface FieldBaseInfo {
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

export interface TextFieldInfo extends FieldBaseInfo {
    type: 'text';
    value: string;
    align: string;
    color: string;
    fontFamily: string;
    fontVariant: string;
    fontSize: number;
    lineHeight?: number;
}

export interface ImageFieldInfo extends FieldBaseInfo {
    type: 'image';
    url?: string;
    global?: boolean;
    base64?: string;
    color?: string;
    imageWidth?: number;
    imageHeight?: number;
    fit?: string;
    zoom?: number;
    cx?: number;
    cy?: number;
    crop?: boolean;
}

export type FieldInfo = TextFieldInfo | ImageFieldInfo;

export interface FieldInfoCollection {
    [propName: string]: FieldInfo;
}

export interface FieldInfoByCardCollection {
    [propName: string]: FieldInfoCollection;
}

export interface JobDataBase {
    type: string;
}

export interface PdfJobData extends JobDataBase {
    type: 'generatePdf';
    accessToken: string;
    collectionType: string;
    collectionId: string;
    pageWidth: number;
    pageHeight: number;
    topBottomMargin: number;
    leftRightMargin: number;
    verticalSpace: number;
    horizontalSpace: number;
    includeBleedingArea: boolean;
    cutMarksForScissors: boolean;
    cutMarksForGuillotine: boolean;
    cutMarksInMarginArea: boolean;
    cutMarksOnFrontSideOnly: boolean;
}

export interface CardJobData extends JobDataBase {
    type: 'generateCard';
    cardSetData: CardSetData;
    cardId: string;
    isBack: boolean;
}

export type JobData = PdfJobData | CardJobData;

export interface CardSetData {
    width: number;
    height: number;
    isTwoSided: boolean;
    cardsAllIds: string[];
    cardsById: CardsCollection;
    fieldsAllIds: string[];
    fields: FieldInfoByCardCollection;
}

export enum ImageType {
    SVG,
    SVG_PATH,
    IMAGE,
    BLOCK_START,
    BLOCK_END,
}

export interface ImageToDraw {
    type: ImageType;
    x: number;
    y: number;
    width: number;
    height: number;
    angle: number;
    fit?: string;
    data: any;
    color?: string;
    scale?: number;
    imageWidth?: number;
    imageHeight?: number;
    zoom?: number;
    cx?: number;
    cy?: number;
    crop?: boolean;
}
