import { Store } from './store';
/**
 * @public
 */
export declare class MemoryStore extends Store {
    store: {
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
    };
    constructor();
    get(): {
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
    };
    update(token: {
        accessToken: string;
        refreshToken?: string;
        expiresIn?: number;
    }): void;
}
