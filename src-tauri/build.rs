use std::{env, fs, path::PathBuf};

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    let dest = out_dir.join("google-oauth.json");
    let real = manifest_dir.join("google-oauth.json");
    let example = manifest_dir.join("google-oauth.example.json");
    if real.exists() {
        fs::copy(&real, &dest).expect("copy google-oauth.json");
    } else {
        fs::copy(&example, &dest).expect("copy google-oauth.example.json");
    }
    println!("cargo:rerun-if-changed=google-oauth.json");
    println!("cargo:rerun-if-changed=google-oauth.example.json");
    tauri_build::build();
}
