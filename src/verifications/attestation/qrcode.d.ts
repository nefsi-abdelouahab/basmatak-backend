/**
 * Minimal ambient types for the `qrcode` package (v1.5.4 ships no
 * declarations). Only the PNG buffer API used by the attestation service is
 * declared; add more members here if a future call site needs them.
 */
declare module 'qrcode' {
  interface QRCodeToBufferOptions {
    type?: 'png' | 'jpeg' | 'webp';
    width?: number;
    margin?: number;
    errorCorrectionLevel?: 'low' | 'medium' | 'quartile' | 'high';
    color?: {
      dark?: string;
      light?: string;
    };
  }

  export function toBuffer(
    text: string,
    options?: QRCodeToBufferOptions,
  ): Promise<Buffer>;
}
