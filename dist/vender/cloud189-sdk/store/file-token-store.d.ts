import { MemoryStore } from './memstore';
/**
 * @public
 */
export declare class FileTokenStore extends MemoryStore {
    #private;
    filePath: string;
    constructor(filePath: string);
    private ensureTokenDirectory;
    update(token: {
        accessToken: string;
        refreshToken?: string;
        expiresIn?: number;
    }): Promise<void>;
}
