import { spawn } from "node:child_process";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const workers = [{ label: "campaigns", file: "campaign-worker.mjs", enabled: true }];
if (process.env.DATABASE_URL && process.env.REDIS_URL) workers.push({ label: "contacts", file: "contact-sync-worker.mjs", enabled: true });
else console.info("Worker de sincronização de contatos aguardando DATABASE_URL e REDIS_URL.");

const children = new Map();
let shuttingDown = false;
for (const worker of workers) {
  const child = spawn(process.execPath, [`scripts/${worker.file}`], { stdio: "inherit", env: process.env });
  children.set(worker.label, child);
  child.once("error", (error) => { console.error(`[worker:${worker.label}] não iniciou`, error); shutdown(1); });
  child.once("exit", (code, signal) => {
    if (!shuttingDown) {
      console.error(`[worker:${worker.label}] encerrou`, { code, signal });
      shutdown(code || 1);
    }
  });
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children.values()) if (child.exitCode === null) child.kill("SIGTERM");
  const timeout = setTimeout(() => { for (const child of children.values()) if (child.exitCode === null) child.kill("SIGKILL"); }, 10_000);
  await Promise.all([...children.values()].map((child) => new Promise((resolve) => child.once("exit", resolve))));
  clearTimeout(timeout);
  process.exit(code);
}

process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));
