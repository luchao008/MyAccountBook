/**
 * 选择本地文件并读成 base64（**仅 H5**）。
 *
 * 为什么不走 uni.uploadFile（multipart）：
 *   后端刻意没有引入文件上传中间件（账单文件只有几十 KB），
 *   接口用 JSON + base64 承载文件内容 —— 与 api 层的实现保持一致。
 *
 * ⚠️ uni.chooseFile 只有 H5 端有；小程序/App 端没有它。
 *    非 H5 端**返回明确失败**（调用方提示"当前端暂不支持"），不静默失败。
 */

/** 允许的扩展名（后端只解析 .xlsx，这里先挡一道，给出更快的反馈） */
export const ACCEPT_EXT = ['.xlsx'];

/** 2MB —— 与后端 `MAX_XLSX_BYTES` 一致，前端先挡，省一次往返 */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

export interface PickedFile {
  /** 文件名（只用于回显与报告） */
  name: string;
  /** 文件内容的 base64（不含 data: 前缀） */
  base64: string;
  /** 字节数 */
  size: number;
}

export type PickFileResult =
  | { ok: true; file: PickedFile }
  | { ok: false; reason: 'unsupported' | 'cancelled' | 'too-large' | 'read-failed'; message?: string };

/** ArrayBuffer → base64（不用 FileReader.readAsDataURL，避免再剥一次前缀与分块问题） */
function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
}

/**
 * 选一个 xlsx 文件并读成 base64。
 *
 * 用 `uni.chooseFile`（不是 `chooseImage`/`chooseMessageFile`），
 * H5 下它会渲染成原生 `<input type="file">`。
 */
export function pickXlsxFile(): Promise<PickFileResult> {
  // #ifdef H5
  return new Promise((resolve) => {
    const choose = (uni as any).chooseFile;
    if (typeof choose !== 'function') {
      resolve({ ok: false, reason: 'unsupported' });
      return;
    }
    choose({
      count: 1,
      extension: ACCEPT_EXT,
      success: (res: any) => {
        /*
         * ⚠️ H5 端 `tempFiles` 里装的就是**原生 File 对象本身**
         * （uni-h5 的 `chooseFile` 把 `event.target.files[i]` 直接 push 进去），
         * 不是 `{ file, name, size }` 那种包装结构 —— 别按小程序的心智去取 `.file`。
         * 这里对两种形态都兼容，免得将来换端时静默失败。
         */
        const first = res?.tempFiles?.[0];
        const file: File | undefined =
          typeof File !== 'undefined' && first instanceof File ? first : first?.file;
        const name: string = first?.name || file?.name || '账单.xlsx';
        const size: number = first?.size ?? file?.size ?? 0;

        if (size > MAX_FILE_BYTES) {
          resolve({ ok: false, reason: 'too-large', message: name });
          return;
        }
        if (!file) {
          resolve({ ok: false, reason: 'read-failed', message: name });
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const buf = reader.result as ArrayBuffer;
          try {
            resolve({ ok: true, file: { name, base64: bufferToBase64(buf), size } });
          } catch (err) {
            console.error('[file] base64 编码失败', err);
            resolve({ ok: false, reason: 'read-failed', message: name });
          }
        };
        reader.onerror = () => resolve({ ok: false, reason: 'read-failed', message: name });
        reader.readAsArrayBuffer(file);
      },
      fail: (err: any) => {
        // 用户取消在 uni 里也走 fail，用 errMsg 区分
        const msg = String(err?.errMsg || '');
        resolve({ ok: false, reason: msg.includes('cancel') ? 'cancelled' : 'read-failed' });
      },
    });
  });
  // #endif
  // #ifndef H5
  return Promise.resolve({ ok: false, reason: 'unsupported' as const });
  // #endif
}