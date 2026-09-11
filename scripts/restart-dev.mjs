import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ports = [3000, 4000];
const dryRun = process.argv.includes("--dry-run");

async function listenersOn(port) {
  try {
    const { stdout } = await execFileAsync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
    return [...new Set(stdout.split(/\s+/).filter(Boolean).map(Number))];
  } catch (error) {
    // lsof exits with 1 when nothing is listening, which is a normal state.
    if (error?.code === 1) return [];
    throw error;
  }
}

async function processTable() {
  const { stdout } = await execFileAsync("ps", ["-axo", "pid=,ppid=,command="]);
  return stdout
    .split("\n")
    .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/))
    .filter(Boolean)
    .map((match) => ({ pid: Number(match[1]), ppid: Number(match[2]), command: match[3] }));
}

function isForgeFitDevRoot(command) {
  return (
    command.includes(projectRoot) &&
    (command.includes("turbo run dev") || command.includes("next dev") || command.includes("tsx watch"))
  );
}

function forgeFitDevOwner(listenerPid, byPid) {
  let pid = listenerPid;
  // Next.js exposes a `next-server` child that does not include its path in the
  // command line, so walk a short parent chain and stop the owning `next dev`.
  for (let depth = 0; depth < 5 && pid > 1; depth += 1) {
    const info = byPid.get(pid);
    if (!info) return null;
    if (isForgeFitDevRoot(info.command)) return pid;
    pid = info.ppid;
  }
  return null;
}

function descendantsOf(rootPid, byParent) {
  const descendants = new Set([rootPid]);
  const pending = [rootPid];
  while (pending.length) {
    const parentPid = pending.pop();
    for (const child of byParent.get(parentPid) ?? []) {
      if (descendants.has(child.pid)) continue;
      descendants.add(child.pid);
      pending.push(child.pid);
    }
  }
  return descendants;
}

async function waitForExit(pid, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
    } catch (error) {
      if (error?.code === "ESRCH") return true;
      throw error;
    }
  }
  return false;
}

const processes = await processTable();
const byPid = new Map(processes.map((process) => [process.pid, process]));
const byParent = new Map();
for (const process of processes) {
  const children = byParent.get(process.ppid) ?? [];
  children.push(process);
  byParent.set(process.ppid, children);
}

const roots = new Set(processes.filter((process) => isForgeFitDevRoot(process.command)).map((process) => process.pid));
for (const port of ports) {
  for (const pid of await listenersOn(port)) {
    const ownerPid = forgeFitDevOwner(pid, byPid);
    if (ownerPid) roots.add(ownerPid);
    else console.log(`Leaving port ${port} listener ${pid} untouched (not a ForgeFit dev process).`);
  }
}

const candidates = new Set([...roots].flatMap((rootPid) => [...descendantsOf(rootPid, byParent)]));
for (const pid of candidates) {
  console.log(`${dryRun ? "Would stop" : "Stopping"} ForgeFit dev process ${pid}.`);
  if (!dryRun) process.kill(pid, "SIGTERM");
}

if (dryRun) process.exit(0);

for (const pid of candidates) {
  if (await waitForExit(pid)) continue;
  console.log(`Force-stopping unresponsive ForgeFit dev process ${pid}.`);
  process.kill(pid, "SIGKILL");
}

console.log("Starting ForgeFit development services…");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const dev = spawn(npm, ["run", "dev"], { cwd: projectRoot, stdio: "inherit" });

dev.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
