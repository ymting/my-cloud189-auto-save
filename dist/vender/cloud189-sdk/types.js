"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QRCodeStatus = exports.OrderByType = exports.MediaType = void 0;
/**
 * 文件类型
 * @public
 */
var MediaType;
(function (MediaType) {
    MediaType[MediaType["ALL"] = 0] = "ALL";
    MediaType[MediaType["IMAGE"] = 1] = "IMAGE";
    MediaType[MediaType["MUSIC"] = 2] = "MUSIC";
    MediaType[MediaType["VIDEO"] = 3] = "VIDEO";
    MediaType[MediaType["TXT"] = 4] = "TXT";
})(MediaType || (exports.MediaType = MediaType = {}));
/**
 * 排序类型
 * @public
 */
var OrderByType;
(function (OrderByType) {
    OrderByType[OrderByType["NAME"] = 1] = "NAME";
    OrderByType[OrderByType["SIZE"] = 2] = "SIZE";
    OrderByType[OrderByType["LAST_OP_TIME"] = 3] = "LAST_OP_TIME";
})(OrderByType || (exports.OrderByType = OrderByType = {}));
/**
 * QR code scan status enum
 * @public
 */
var QRCodeStatus;
(function (QRCodeStatus) {
    /** Login success */
    QRCodeStatus[QRCodeStatus["SUCCESS"] = 0] = "SUCCESS";
    /** Waiting for user to scan */
    QRCodeStatus[QRCodeStatus["WAITING"] = -106] = "WAITING";
    /** User scanned, waiting for confirmation on device */
    QRCodeStatus[QRCodeStatus["SCANNED"] = -11002] = "SCANNED";
    /** QR code expired */
    QRCodeStatus[QRCodeStatus["EXPIRED"] = -11001] = "EXPIRED";
})(QRCodeStatus || (exports.QRCodeStatus = QRCodeStatus = {}));
