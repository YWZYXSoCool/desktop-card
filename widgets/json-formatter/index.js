// JSON 格式化外部 widget（QuickJS 沙箱，声明式 UI）。
// 输入 JSON → 格式化 / 压缩 / 清空；缩进可在设置里选 2 / 4 空格。

const state = {
    input: "",
    output: "",
    error: "",
    indent: 2,
};

// 解析并格式化；失败返回错误信息（null 表示成功）。
function transform(src, mode) {
    let parsed;
    try {
        parsed = JSON.parse(src);
    } catch (e) {
        return { error: "JSON 解析失败：" + (e && e.message ? e.message : e) };
    }
    if (mode === "minify") {
        return { output: JSON.stringify(parsed) };
    }
    return { output: JSON.stringify(parsed, null, state.indent) };
}

registerWidget({
    setup(ctx) {
        // 设置项经共享 store 恢复（沙箱无 ctx.settings，需经 store 读写）
        state.indent = ctx.store.get("json.indent", 2);
    },

    render() {
        const children = [];

        // 输入区：每次输入回报当前值到 handleEvent
        children.push({
            type: "textarea",
            props: { value: state.input, placeholder: "粘贴 JSON…" },
            style: {
                flex: "1 1 0%",
                width: "100%",
                boxSizing: "border-box",
                fontSize: "12px",
                fontFamily: "monospace",
                resize: "none",
            },
            on: "input",
        });

        // 操作按钮
        children.push({
            type: "row",
            style: { gap: "8px", justifyContent: "center" },
            children: [
                { type: "button", props: { label: "格式化" }, on: "format" },
                { type: "button", props: { label: "压缩" }, on: "minify" },
                { type: "button", props: { label: "清空" }, on: "clear" },
            ],
        });

        // 错误提示
        if (state.error) {
            children.push({
                type: "text",
                props: { value: state.error },
                style: { color: "#e06c6c", fontSize: "12px" },
            });
        }

        // 输出区：box 提供块级滚动容器，text 以等宽 pre-wrap 展示格式化结果
        children.push({
            type: "box",
            style: { flex: "1 1 0%", overflow: "auto", minHeight: "0" },
            children: [
                {
                    type: "text",
                    props: { value: state.output },
                    style: {
                        fontFamily: "monospace",
                        fontSize: "11px",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                    },
                },
            ],
        });

        return {
            type: "column",
            style: {
                height: "100%",
                gap: "8px",
                padding: "4px",
                boxSizing: "border-box",
            },
            children,
        };
    },

    handleEvent(id, _type, data) {
        if (id === "input") {
            state.input = String(data || "");
            state.error = "";
        } else if (id === "format") {
            const r = transform(state.input, "format");
            state.output = r.output || "";
            state.error = r.error || "";
        } else if (id === "minify") {
            const r = transform(state.input, "minify");
            state.output = r.output || "";
            state.error = r.error || "";
        } else if (id === "clear") {
            state.input = "";
            state.output = "";
            state.error = "";
        }
    },

    onSettingChange(key, value, ctx) {
        if (key === "json.indent") {
            state.indent = Number(value);
            ctx.store.set("json.indent", state.indent);
        }
    },
});