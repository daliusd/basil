// XXX: Careful! Code duplication here. If you change types or constants in saffron then change here as well.

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
    placeholders: PlaceholdersCollection;
    placeholdersAllIds: string[];
    texts: PlaceholdersTextInfoByCardCollection;
    images: PlaceholdersImageInfoByCardCollection;
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
}
