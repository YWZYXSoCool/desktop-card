/**
 * 单位转换器的数据层：进制转换 + 各类物理量单位。
 *
 * 模型：每个单位相对「基准单位」做换算。线性单位用 factor 派生 toBase/fromBase；
 * 温度这类带偏移量的用显式函数。UnitPage 用「任一输入框可编辑、其余自动同步」的
 * 通用交互（与进制转换一致），canonical 值统一存基准单位。
 */

export interface Unit {
    key: string;
    name: string;
    /** 从本单位的数值换算到基准单位。 */
    toBase: (v: number) => number;
    /** 从基准单位反算回本单位的数值。 */
    fromBase: (b: number) => number;
}

export interface UnitCategory {
    key: string;
    name: string;
    units: Unit[];
}

/** 线性单位：基准换算即乘/除一个因子。 */
const linear = (factor: number): Pick<Unit, "toBase" | "fromBase"> => ({
    toBase: (v) => v * factor,
    fromBase: (b) => b / factor,
});

/** 各类物理量单位（离线、纯本地换算）。 */
export const CATEGORIES: UnitCategory[] = [
    {
        key: "length",
        name: "长度",
        units: [
            { key: "km", name: "千米", ...linear(1000) },
            { key: "m", name: "米", ...linear(1) },
            { key: "cm", name: "厘米", ...linear(0.01) },
            { key: "mm", name: "毫米", ...linear(0.001) },
            { key: "mi", name: "英里", ...linear(1609.344) },
            { key: "ft", name: "英尺", ...linear(0.3048) },
            { key: "in", name: "英寸", ...linear(0.0254) },
            { key: "li", name: "里", ...linear(500) },
        ],
    },
    {
        key: "weight",
        name: "重量",
        units: [
            { key: "t", name: "吨", ...linear(1000) },
            { key: "kg", name: "千克", ...linear(1) },
            { key: "g", name: "克", ...linear(0.001) },
            { key: "mg", name: "毫克", ...linear(1e-6) },
            { key: "lb", name: "磅", ...linear(0.45359237) },
            { key: "oz", name: "盎司", ...linear(0.028349523125) },
            { key: "jin", name: "斤", ...linear(0.5) },
        ],
    },
    {
        key: "temperature",
        name: "温度",
        // 基准单位 = 摄氏度（带偏移，需显式函数而非线性因子）
        units: [
            { key: "c", name: "摄氏度", toBase: (v) => v, fromBase: (b) => b },
            {
                key: "f",
                name: "华氏度",
                toBase: (v) => ((v - 32) * 5) / 9,
                fromBase: (b) => (b * 9) / 5 + 32,
            },
            {
                key: "k",
                name: "开尔文",
                toBase: (v) => v - 273.15,
                fromBase: (b) => b + 273.15,
            },
        ],
    },
    {
        key: "area",
        name: "面积",
        units: [
            { key: "km2", name: "平方千米", ...linear(1e6) },
            { key: "m2", name: "平方米", ...linear(1) },
            { key: "cm2", name: "平方厘米", ...linear(1e-4) },
            { key: "ha", name: "公顷", ...linear(10000) },
            { key: "mu", name: "亩", ...linear(2000 / 3) },
            { key: "ft2", name: "平方英尺", ...linear(0.09290304) },
        ],
    },
    {
        key: "volume",
        name: "体积",
        units: [
            { key: "m3", name: "立方米", ...linear(1000) },
            { key: "l", name: "升", ...linear(1) },
            { key: "ml", name: "毫升", ...linear(0.001) },
            { key: "gal", name: "加仑(美)", ...linear(3.785411784) },
            { key: "ft3", name: "立方英尺", ...linear(28.3168) },
        ],
    },
    {
        key: "data",
        name: "数据",
        units: [
            { key: "b", name: "字节", ...linear(1) },
            { key: "kb", name: "千字节", ...linear(1024) },
            { key: "mb", name: "兆字节", ...linear(1024 ** 2) },
            { key: "gb", name: "吉字节", ...linear(1024 ** 3) },
            { key: "tb", name: "太字节", ...linear(1024 ** 4) },
            { key: "bit", name: "位", ...linear(0.125) },
        ],
    },
    {
        key: "time",
        name: "时间",
        units: [
            { key: "s", name: "秒", ...linear(1) },
            { key: "min", name: "分钟", ...linear(60) },
            { key: "h", name: "小时", ...linear(3600) },
            { key: "d", name: "天", ...linear(86400) },
            { key: "w", name: "周", ...linear(604800) },
        ],
    },
    {
        key: "speed",
        name: "速度",
        units: [
            { key: "ms", name: "米/秒", ...linear(1) },
            { key: "kmh", name: "千米/时", ...linear(1 / 3.6) },
            { key: "mph", name: "英里/时", ...linear(0.44704) },
            { key: "kn", name: "节", ...linear(0.514444) },
        ],
    },
    {
        key: "pressure",
        name: "压力",
        units: [
            { key: "pa", name: "帕", ...linear(1) },
            { key: "kpa", name: "千帕", ...linear(1000) },
            { key: "mpa", name: "兆帕", ...linear(1e6) },
            { key: "bar", name: "巴", ...linear(1e5) },
            { key: "atm", name: "标准大气压", ...linear(101325) },
            { key: "mmhg", name: "毫米汞柱", ...linear(133.322) },
        ],
    },
];

/** 把换算结果格式化为可读文本：去掉浮点噪声与多余的尾零。 */
export function fmt(n: number): string {
    if (!isFinite(n)) return "";
    return String(parseFloat(n.toPrecision(12)));
}