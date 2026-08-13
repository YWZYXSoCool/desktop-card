export interface CountdownData {
    target: string | null;
    name: string;
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