import { Got } from 'got';
import { UserSignResponse, UserSizeInfoResponse, FamilyListResponse, FamilyUserSignResponse, ConfigurationOptions, ClientSession, PageQuery, FileListResponse, RsaKey, UploadInitResponse, UploadCommitResponse, CreateFolderRequest, UploadCallbacks, RenameFolderRequest, CreateBatchTaskRequest, CreateFamilyBatchTaskRequest, CreateFamilyFolderRequest, RenameFamilyFolderRequest, CommitMultiFamilyUploadRequest, CommitMultiUploadRequest, initMultiUploadRequest, initMultiFamilyUploadRequest } from './types';
import { CloudAuthClient } from './CloudAuthClient';
import { Store } from './store';
/**
 * 天翼网盘客户端
 * @public
 */
export declare class CloudClient {
    #private;
    username: string;
    password: string;
    ssonCookie: string;
    tokenStore: Store;
    readonly request: Got;
    readonly authClient: CloudAuthClient;
    readonly session: ClientSession;
    private sessionKeyPromise;
    private accessTokenPromise;
    private rsaKey;
    private generateRsaKeyPromise;
    private onQRCodeReady?;
    private qrLoginOptions?;
    private proxyUrl;
    private forceRefresh;
    constructor(_options: ConfigurationOptions);
    setProxy(proxyUrl: string | null): void;
    getSession(): Promise<import("./types").TokenSession>;
    /**
     * 获取 sessionKey
     * @returns sessionKey
     */
    getSessionKey(): Promise<string>;
    /**
     * 获取 accessToken
     * @returns accessToken
     */
    getAccessToken(): Promise<string>;
    /**
     * 获取 RSA key
     * @returns RSAKey
     */
    generateRsaKey(): Promise<RsaKey>;
    /**
     * 获取用户网盘存储容量信息
     * @returns 账号容量结果
     */
    getUserSizeInfo(): Promise<UserSizeInfoResponse>;
    /**
     * 个人签到任务
     * @returns 签到结果
     */
    userSign(): Promise<UserSignResponse>;
    /**
     * 获取家庭信息
     * @returns 家庭列表信息
     */
    getFamilyList(): Promise<FamilyListResponse>;
    /**
     * 家庭签到任务
     * @param familyId - 家庭id
     * @returns 签到结果
     * @deprecated 已无效
     */
    familyUserSign(familyId: string): Promise<FamilyUserSignResponse>;
    /**
     * 获取文件列表
     * @param pageQuery - 查询参数
     * @returns
     */
    getListFiles(pageQuery?: PageQuery, familyId?: string): Promise<FileListResponse>;
    /**
     * 创建文件夹
     * @param createFolderRequest - 创建文件夹请求
     * @returns
     */
    createFolder(createFolderRequest: CreateFolderRequest | CreateFamilyFolderRequest): Promise<{
        id: string;
        name: string;
        parentId: string;
    }>;
    /**
     * 重命名文件夹
     * @param renameFolderRequest - 重名文件夹请求
     * @returns
     */
    renameFolder(renameFolderRequest: RenameFolderRequest | RenameFamilyFolderRequest): import("got").CancelableRequest<unknown>;
    /**
     * 初始化上传
     * @param initMultiUploadRequest - 初始化请求
     * @returns
     */
    initMultiUpload(initMultiUploadRequest: initMultiUploadRequest | initMultiFamilyUploadRequest): Promise<UploadInitResponse>;
    /**
     * 提交上传
     * @param commitMultiUploadRequest - 提交请求
     * @returns
     */
    commitMultiUpload(commitMultiUploadRequest: CommitMultiUploadRequest | CommitMultiFamilyUploadRequest): import("got").CancelableRequest<UploadCommitResponse>;
    /**
     * 检测秒传
     * @param params - 检查参数
     * @returns
     */
    checkTransSecond(params: {
        fileMd5: string;
        sliceMd5: string;
        uploadFileId: string;
        familyId?: number;
    }): import("got").CancelableRequest<UploadInitResponse>;
    /**
     * 文件上传
     * @param param - 上传参数
     * @param callbacks - 上传回调
     * @returns
     */
    upload(param: {
        parentFolderId: string;
        filePath: string;
        familyId?: string;
    }, callbacks?: UploadCallbacks): Promise<{
        fileDataExists: number;
        file: {
            userFileId: string;
            fileName: string;
            fileSize: number;
            fileMd5: string;
            createDate: string;
            rev: number;
            userId: number;
        };
        code: string;
    }>;
    /**
     * 检测任务状态
     * @param type - 任务类型
     * @param taskId - 任务Id
     * @param maxAttempts - 重试次数
     * @param interval - 重试间隔
     * @returns
     */
    checkTaskStatus(type: string, taskId: string, maxAttempts?: number, interval?: number): Promise<{
        successedFileIdList?: number[];
        taskId: string;
        taskStatus: number;
    }>;
    /**
     * 创建任务
     * @param createBatchTaskRequest - 创建任务参数
     * @returns
     */
    createBatchTask(createBatchTaskRequest: CreateBatchTaskRequest | CreateFamilyBatchTaskRequest): Promise<{
        successedFileIdList?: number[];
        taskId: string;
        taskStatus: number;
    }>;
    /**
     * 获取文件下载路径
     * @param params - 文件参数
     * @returns
     */
    getFileDownloadUrl(params: {
        fileId: string;
        familyId?: string;
    }): import("got").CancelableRequest<{
        fileDownloadUrl: string;
    }>;
}
