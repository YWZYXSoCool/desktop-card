//! 沙箱可下放的加密/编解码原语（`ctx.crypto`）。
//!
//! 全部为无状态纯函数：哈希（md5/sha1/sha256 → hex）+ 编解码（base64/hex）。
//! 经 `sandbox::create_sandbox` 注入给声明了 `crypto` 权限的 widget。
//! 沙箱函数只收/发 `String`，宿主侧排版错误一律以 `{ok:false,error}` 回传。

use base64::Engine;

const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;

/// 任意字节 → 小写 hex。
fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

pub fn md5_hex(input: &str) -> String {
    use md5::Digest;
    let mut h = md5::Md5::new();
    h.update(input.as_bytes());
    to_hex(&h.finalize())
}

pub fn sha1_hex(input: &str) -> String {
    use sha1::Digest;
    let mut h = sha1::Sha1::new();
    h.update(input.as_bytes());
    to_hex(&h.finalize())
}

pub fn sha256_hex(input: &str) -> String {
    use sha2::Digest;
    let mut h = sha2::Sha256::new();
    h.update(input.as_bytes());
    to_hex(&h.finalize())
}

pub fn base64_encode(input: &str) -> String {
    B64.encode(input.as_bytes())
}

pub fn base64_decode(input: &str) -> Result<String, String> {
    let bytes = B64.decode(input.trim()).map_err(|e| e.to_string())?;
    String::from_utf8(bytes).map_err(|e| e.to_string())
}

pub fn hex_encode(input: &str) -> String {
    to_hex(input.as_bytes())
}

pub fn hex_decode(input: &str) -> Result<String, String> {
    let s = input.trim();
    if s.len() % 2 != 0 {
        return Err("hex 长度必须为偶数".into());
    }
    let mut out = Vec::with_capacity(s.len() / 2);
    let bytes = s.as_bytes();
    for i in (0..bytes.len()).step_by(2) {
        let hi = hex_val(bytes[i]).ok_or("包含非十六进制字符")?;
        let lo = hex_val(bytes[i + 1]).ok_or("包含非十六进制字符")?;
        out.push((hi << 4) | lo);
    }
    String::from_utf8(out).map_err(|e| e.to_string())
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// 宿主注入给沙箱的单一入口：`op` 之一，`input` 为原文。
/// 成功 → `{"ok":true,"value":...}`；失败 → `{"ok":false,"error":...}`。
pub fn dispatch(op: &str, input: &str) -> String {
    let result = match op {
        "md5" => Ok(crate::crypto::md5_hex(input).into()),
        "sha1" => Ok(crate::crypto::sha1_hex(input).into()),
        "sha256" => Ok(crate::crypto::sha256_hex(input).into()),
        "b64encode" => Ok(crate::crypto::base64_encode(input).into()),
        "b64decode" => crate::crypto::base64_decode(input),
        "hex" => Ok(crate::crypto::hex_encode(input).into()),
        "unhex" => crate::crypto::hex_decode(input),
        _ => return serde_json::json!({ "ok": false, "error": format!("unknown crypto op: {op}") }).to_string(),
    };
    match result {
        Ok(value) => serde_json::json!({ "ok": true, "value": value }).to_string(),
        Err(e) => serde_json::json!({ "ok": false, "error": e }).to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn md5_matches_known_vectors() {
        assert_eq!(md5_hex(""), "d41d8cd98f00b204e9800998ecf8427e");
        assert_eq!(md5_hex("abc"), "900150983cd24fb0d6963f7d28e17f72");
        // wbi.md 的签名示例：query + mixin_key。
        assert_eq!(
            md5_hex("bar=514&foo=114&wts=1702204169&zab=1919810ea1db124af3c7062474693fa704f4ff8"),
            "8f6f2b5b3d485fe1886cec6a0be8c5d4"
        );
    }

    #[test]
    fn sha_functions_work() {
        assert_eq!(
            sha256_hex("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(sha1_hex("abc"), "a9993e364706816aba3e25717850c26c9cd0d89d");
    }

    #[test]
    fn base64_roundtrip_and_hex() {
        assert_eq!(base64_encode("hello 世界"), "aGVsbG8g5LiW55WM");
        assert_eq!(base64_decode("aGVsbG8g5LiW55WM").unwrap(), "hello 世界");
        assert!(base64_decode("!!!not-base64!!!").is_err());

        assert_eq!(hex_encode("A"), "41");
        assert_eq!(hex_decode("41").unwrap(), "A");
        assert_eq!(hex_decode("4").is_err(), true);
        assert!(hex_decode("zz").is_err());
    }

    #[test]
    fn dispatch_roundtrip_json() {
        let ok: serde_json::Value = serde_json::from_str(&dispatch("md5", "abc")).unwrap();
        assert_eq!(ok["ok"], true);
        assert_eq!(ok["value"], "900150983cd24fb0d6963f7d28e17f72");

        let bad: serde_json::Value = serde_json::from_str(&dispatch("b64decode", "@@")).unwrap();
        assert_eq!(bad["ok"], false);

        let unknown: serde_json::Value = serde_json::from_str(&dispatch("nope", "x")).unwrap();
        assert_eq!(unknown["ok"], false);
    }
}