import { BinaryToTextEncoding } from 'crypto';
export declare const sortParameter: (data: any) => string;
export declare const getSignature: (data: any) => string;
export declare const rsaEncrypt: (publicKey: string, origData: string, encoding?: BinaryToTextEncoding) => string;
export declare const aesECBEncrypt: (data: any, key: string) => string;
export declare const hmacSha1: (data: any, key: any, encoding?: BinaryToTextEncoding) => string;
export declare const hexToBase64: (data: any) => string;
export declare const md5: (data: any) => string;
export declare const randomString: (f: string) => string;
export declare const partSize: (size: any) => number;
export declare const calculateFileAndChunkMD5: (filePath: any, chunkSize?: number) => Promise<{
    fileMd5: string;
    chunkMd5s: string[];
}>;
export declare const asyncPool: (poolLimit: any, array: any, iteratorFn: any) => Promise<any[]>;
