/**
 * 颜色换算工具：RGB / HEX / HSL / HSB 之间的纯函数转换。
 * 色盘（Palette）用 HSB，格式行用 HEX/RGB/HSL，取色器直接给 RGB —— 共用同一份逻辑。
 */

/** 0-255 的 RGB 通道。 */
export interface RGB {
    r: number;
    g: number;
    b: number;
}

/** 色相 0-360，饱和度/亮度 0-100。 */
export interface HSL {
    h: number;
    s: number;
    l: number;
}

/** 色相 0-360，饱和度/亮度 0-100。 */
export interface HSB {
    h: number;
    s: number;
    b: number;
}

/** 把 0-255 通道夹到合法范围。 */
function clamp(n: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, n));
}

export function rgbToHex({ r, g, b }: RGB): string {
    return (
        "#" +
        [r, g, b].map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0")).join("").toUpperCase()
    );
}

/** 解析 3 位或 6 位 hex（可带 #、大小写均可）；非法返回 null。 */
export function hexToRgb(hex: string): RGB | null {
    let s = hex.trim().replace(/^#/, "");
    if (s.length === 3) s = s.split("").map((c) => c + c).join("");
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
    return {
        r: parseInt(s.slice(0, 2), 16),
        g: parseInt(s.slice(2, 4), 16),
        b: parseInt(s.slice(4, 6), 16),
    };
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
    const rn = r / 255,
        gn = g / 255,
        bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
        else if (max === gn) h = (bn - rn) / d + 2;
        else h = (rn - gn) / d + 4;
        h *= 60;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
    const sn = clamp(s, 0, 100) / 100;
    const ln = clamp(l, 0, 100) / 100;
    const c = (1 - Math.abs(2 * ln - 1)) * sn;
    const hp = (((h % 360) + 360) % 360) / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0;
    let g = 0;
    let b = 0;
    if (hp < 1) {
        r = c;
        g = x;
    } else if (hp < 2) {
        r = x;
        g = c;
    } else if (hp < 3) {
        g = c;
        b = x;
    } else if (hp < 4) {
        g = x;
        b = c;
    } else if (hp < 5) {
        r = x;
        b = c;
    } else {
        r = c;
        b = x;
    }
    const m = ln - c / 2;
    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255),
    };
}

export function rgbToHsb({ r, g, b }: RGB): HSB {
    const rn = r / 255,
        gn = g / 255,
        bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;
    const br = max * 100;
    const s = max === 0 ? 0 : (d / max) * 100;
    let h = 0;
    if (max !== min) {
        if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
        else if (max === gn) h = (bn - rn) / d + 2;
        else h = (rn - gn) / d + 4;
        h *= 60;
    }
    return { h: Math.round(h), s: Math.round(s), b: Math.round(br) };
}

export function hsbToRgb({ h, s, b }: HSB): RGB {
    const sn = clamp(s, 0, 100) / 100;
    const bn = clamp(b, 0, 100) / 100;
    const c = bn * sn;
    const hp = (((h % 360) + 360) % 360) / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0;
    let g = 0;
    let bl = 0;
    if (hp < 1) {
        r = c;
        g = x;
    } else if (hp < 2) {
        r = x;
        g = c;
    } else if (hp < 3) {
        g = c;
        bl = x;
    } else if (hp < 4) {
        g = x;
        bl = c;
    } else if (hp < 5) {
        r = x;
        bl = c;
    } else {
        r = c;
        bl = x;
    }
    const m = bn - c;
    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((bl + m) * 255),
    };
}

/* 各格式的展示文本（供格式行 / 复制）。 */
export function fmtHex(rgb: RGB): string {
    return rgbToHex(rgb);
}

export function fmtRgb(rgb: RGB): string {
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

export function fmtHsl(rgb: RGB): string {
    const { h, s, l } = rgbToHsl(rgb);
    return `hsl(${h}, ${s}%, ${l}%)`;
}