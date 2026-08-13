export interface CountdownData {
    target: string | null;
    name: string;
}

/** 目标时刻相对某时刻的剩余时间（已到点则 done=true 且各项为绝对值）。 */
export interface Remain {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    done: boolean;
}

/** 计算 target 相对 now 的剩余时间（纯函数，便于单测）。 */
export function remaining(target: Date, now: Date): Remain {
    const ms = target.getTime() - now.getTime();
    const done = ms <= 0;
    const a = Math.abs(ms);
    return {
        days: Math.floor(a / 86_400_000),
        hours: Math.floor((a % 86_400_000) / 3_600_000),
        minutes: Math.floor((a % 3_600_000) / 60_000),
        seconds: Math.floor((a % 60_000) / 1000),
        done,
    };
}

/** Countdown widget 的可变状态：目标时刻（ISO）+ 可选事件名称。 */
class CountdownStore {
    target = $state<string | null>(null);
    name = $state("");

    /** 启动时用持久化的值填充。 */
    load(target: string | null, name: string): void {
        this.target = target;
        this.name = name;
    }

    set(target: string, name: string): void {
        this.target = target;
        this.name = name;
    }

    clear(): void {
        this.target = null;
        this.name = "";
    }
}

export const countdown = new CountdownStore();