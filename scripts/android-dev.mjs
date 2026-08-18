import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const sdk =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  path.join(process.env.LOCALAPPDATA ?? "", "Android", "Sdk");

const adb = path.join(sdk, "platform-tools", "adb.exe");
const emulatorBin = path.join(sdk, "emulator", "emulator.exe");
const avdName = process.env.CHRONOWARD_AVD || "Pixel_7";

if (!fs.existsSync(adb)) {
  console.error(`adb not found at ${adb}`);
  process.exit(1);
}

function resolveJavaHome() {
  const gradleJdk21 = path.join(
    process.env.USERPROFILE ?? "",
    ".gradle",
    "jdks",
    "jetbrains_s_r_o_-21-amd64-windows.2",
  );
  const studioJbr = path.join(
    process.env["ProgramFiles"] ?? "C:\\Program Files",
    "Android",
    "Android Studio",
    "jbr",
  );
  if (fs.existsSync(path.join(gradleJdk21, "bin", "java.exe"))) {
    return gradleJdk21;
  }
  if (fs.existsSync(path.join(studioJbr, "bin", "java.exe"))) {
    return studioJbr;
  }
  return null;
}

const javaHome = resolveJavaHome();
if (javaHome) {
  process.env.JAVA_HOME = javaHome;
  console.log(`Using JAVA_HOME=${javaHome}`);
}

process.env.ANDROID_HOME = sdk;
process.env.ANDROID_SDK_ROOT = sdk;
process.env.PATH = [
  path.join(sdk, "platform-tools"),
  path.join(sdk, "emulator"),
  process.env.PATH ?? "",
].join(path.delimiter);

function run(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
    windowsHide: true,
  });
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function listedDevices() {
  const result = run(adb, ["devices"]);
  return (result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("List of devices"))
    .map((line) => {
      const [serial, status] = line.split(/\s+/);
      return { serial, status };
    })
    .filter((entry) => entry.serial);
}

function readyDevice() {
  return listedDevices().find((entry) => entry.status === "device") ?? null;
}

function killEmulators() {
  console.log("Stopping frozen emulator processes...");
  for (const name of ["qemu-system-x86_64.exe", "emulator.exe"]) {
    run("taskkill", ["/F", "/IM", name]);
  }
  run(adb, ["kill-server"]);
  sleep(2000);
  run(adb, ["start-server"]);
}

function startEmulator() {
  if (!fs.existsSync(emulatorBin)) {
    console.error(`emulator not found at ${emulatorBin}`);
    process.exit(1);
  }
  const args = [
    "-avd",
    avdName,
    "-netdelay",
    "none",
    "-netspeed",
    "full",
    "-no-snapshot-load",
    "-gpu",
    "swiftshader_indirect",
  ];
  console.log(`Cold-booting AVD ${avdName} (no snapshot, software GPU)...`);
  const child = spawn(emulatorBin, args, {
    env: process.env,
    stdio: "ignore",
    detached: true,
    windowsHide: false,
  });
  child.unref();
}

console.log(`Using ANDROID_HOME=${sdk}`);
run(adb, ["start-server"]);

const alreadyReady = readyDevice();
if (alreadyReady) {
  console.log(`ADB already ready: ${alreadyReady.serial}`);
} else {
  killEmulators();
  startEmulator();
}

const deadline = Date.now() + 240_000;
while (!readyDevice()) {
  if (Date.now() > deadline) {
    console.error("Timed out waiting for a usable emulator.");
    console.error("Close the Pixel window with its X button if it is still frozen, then rerun.");
    process.exit(1);
  }
  const snapshot = listedDevices();
  if (snapshot.length === 0) {
    console.log("Waiting for emulator ADB... (no devices yet)");
  } else {
    console.log(
      `Waiting for emulator ADB... (${snapshot
        .map((entry) => `${entry.serial}:${entry.status}`)
        .join(", ")})`,
    );
  }
  sleep(3000);
}

const device = readyDevice();
console.log(`ADB ready: ${device.serial} (${device.status})`);

delete process.env.TAURI_DEV_HOST;
console.log("Forwarding localhost:1420/1421 into the emulator...");
run(adb, ["-s", device.serial, "reverse", "tcp:1420", "tcp:1420"]);
run(adb, ["-s", device.serial, "reverse", "tcp:1421", "tcp:1421"]);

const tauriJs = path.join(process.cwd(), "node_modules", "@tauri-apps", "cli", "tauri.js");
const extraArgs = process.argv.slice(2);
const hasHost = extraArgs.some(
  (arg) => arg === "--host" || arg.startsWith("--host="),
);
const tauriArgs = hasHost ? extraArgs : ["--host", "127.0.0.1", ...extraArgs];
console.log(
  hasHost
    ? "Using caller --host for the Android WebView"
    : "Pinning Android WebView to http://127.0.0.1:1420 (Windows otherwise picks a random NIC)",
);
const child = spawn(process.execPath, [tauriJs, "android", "dev", ...tauriArgs], {
  env: process.env,
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : code ?? 1);
});
