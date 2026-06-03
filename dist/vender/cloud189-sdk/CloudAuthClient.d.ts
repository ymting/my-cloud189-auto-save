import { Got } from 'got';
import { RefreshTokenSession, TokenSession, CacheQuery, QRCodeData, QRCodeStatusResponse, QRLoginOptions } from './types';
/**
 * @public
 */
export declare class CloudAuthClient {
    #private;
    readonly authRequest: Got;
    private proxyUrl;
    constructor();
    setProxy(proxyUrl: string | null): void;
    /**
     * 获取加密参数
     * @returns
     */
    getEncrypt(): Promise<{
        data: {
            pubKey: string;
            pre: string;
        };
    }>;
    getLoginForm(): Promise<CacheQuery>;
    getSessionForPC(param: {
        redirectURL?: string;
        accessToken?: string;
    }): Promise<TokenSession>;
    /**
     * 用户名密码登录
     * */
    loginByPassword(username: string, password: string): Promise<TokenSession>;
    /**
     * token登录
     */
    loginByAccessToken(accessToken: string): Promise<TokenSession>;
    /**
     * sso登录
     */
    loginBySsoCooike(cookie: string): Promise<TokenSession>;
    /**
     * 刷新token
     */
    refreshToken(refreshToken: string): Promise<RefreshTokenSession>;
    /**
     * Get QR code data for scanning login
     * @returns QR code data including uuid for display
     */
    getQRCode(): Promise<QRCodeData>;
    /**
     * Check QR code scan status
     * @param qrData - QR code data from getQRCode
     * @returns status and redirectUrl on success
     */
    checkQRCodeStatus(qrData: QRCodeData): Promise<QRCodeStatusResponse>;
    /**
     * QR code login with polling
     * @param onQRReady - callback invoked with QR code URL for display
     * @param options - polling interval and timeout
     * @returns token session
     */
    loginByQRCode(onQRReady: (qrUrl: string) => void, options?: QRLoginOptions): Promise<TokenSession>;
}
