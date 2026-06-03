import { NormalizedOptions } from 'got';
export declare const signatureAccesstoken: (options: NormalizedOptions, accessToken: string) => void;
export declare const signatureAppKey: (options: NormalizedOptions, appkey: string) => void;
export declare const signatureUpload: (options: NormalizedOptions, rsaKey: {
    pubKey: string;
    pkId: string;
}, sessionKey: string) => void;
