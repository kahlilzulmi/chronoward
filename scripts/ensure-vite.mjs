import { spawn } from "node:child_process";
import process from "node:process";

const viteUrl = "http://127.0.0.1:1420/";

async function viteIsUp() {
  try {
    const response = await fetch(viteUrl, {
      signal: AbortSignal.timeout(800),
    });
    return response.ok;
  } catch {
    return false;
  }
}

if (await viteIsUp()) {
  console.log(`Vite already running at ${viteUrl} — reusing it for this Tauri process.`);
  process.exit(0);
}

const child = spawn("npm", ["run", "dev"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : code ?? 1);
});
