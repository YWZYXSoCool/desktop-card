/// <reference path="./types.d.ts" />

const state = { count: 0, step: 1 };

registerWidget({
    setup(ctx) {
        state.count = ctx.store.get("counter.count", 0);
        state.step = ctx.store.get("counter.step", 1);
    },

    render() {
        return {
            type: "column",
            style: {
                gap: "8px",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
            },
            children: [
                {
                    type: "text",
                    props: { value: String(state.count) },
                    style: {
                        fontSize: "40px",
                        fontVariantNumeric: "tabular-nums",
                        lineHeight: "1",
                    },
                },
                {
                    type: "row",
                    style: { gap: "8px" },
                    children: [
                        { type: "button", props: { label: "−" }, on: "dec" },
                        { type: "button", props: { label: "＋" }, on: "inc" },
                        {
                            type: "button",
                            props: { label: "清零" },
                            on: "reset",
                        },
                    ],
                },
            ],
        };
    },

    handleEvent(id, _type, _data, ctx) {
        if (id === "dec") {
            state.count -= state.step;
            ctx.store.set("counter.count", state.count);
        } else if (id === "inc") {
            state.count += state.step;
            ctx.store.set("counter.count", state.count);
        } else if (id === "reset") {
            state.count = 0;
            ctx.store.set("counter.count", 0);
            ctx.toast.info("已清零");
        }
    },

    onSettingChange(key, value, ctx) {
        if (key === "counter.step") {
            state.step = Number(value);
            ctx.store.set("counter.step", state.step);
            ctx.toast.info("步长已更新为 " + state.step);
        }
    },
});
