// CI checks the installer against the public key embedded in the app before publication.
use base64::{engine::general_purpose::STANDARD, Engine};
use minisign_verify::{PublicKey, Signature};
use std::{error::Error, fs};

fn main() -> Result<(), Box<dyn Error>> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 {
        return Err("Usage: verify_update <tauri.conf.json> <installer.exe>".into());
    }
    let config: serde_json::Value = serde_json::from_str(&fs::read_to_string(&args[1])?)?;
    let key = config["plugins"]["updater"]["pubkey"]
        .as_str()
        .ok_or("Missing public key")?;
    let key = String::from_utf8(STANDARD.decode(key.trim())?)?;
    let signature = fs::read_to_string(format!("{}.sig", args[2]))?;
    let signature = String::from_utf8(STANDARD.decode(signature.trim())?)?;
    PublicKey::decode(&key)?.verify(&fs::read(&args[2])?, &Signature::decode(&signature)?, true)?;
    println!("Installer signature matches the application's public key.");
    Ok(())
}
