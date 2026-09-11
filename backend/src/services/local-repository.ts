import { access, lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { getConfig } from "../config.js";

const ignoredDirectories = new Set([
  ".git", ".next", ".turbo", ".cache", ".idea", ".vscode", "coverage", "dist",
  "build", "node_modules", "vendor", "tmp", "temp", "uploads",
]);
const ignoredFiles = new Set([
  ".DS_Store", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb",
]);
const textExtensions = new Set([
  ".c", ".cc", ".cpp", ".cs", ".css", ".go", ".graphql", ".h", ".html", ".java",
  ".js", ".json", ".jsx", ".kt", ".kts", ".md", ".mjs", ".php", ".prisma", ".py",
  ".rb", ".rs", ".scss", ".sh", ".sql", ".swift", ".toml", ".ts", ".tsx", ".vue",
  ".xml", ".yaml", ".yml",
]);
const exactTextFiles = new Set([
  "Dockerfile", "Makefile", "Procfile", "README", "LICENSE", "Gemfile", "go.mod",
  "go.sum", "requirements.txt",
]);
const sensitiveNamePattern = /(^|[._-])(?:\.env|credentials?|secrets?|private[_-]?key|id_rsa|id_ed25519)(?:$|[._-])/i;
const redactedAssignmentPattern = /(api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password)\s*([:=])\s*(["'`])([^"'`\n]{8,})(["'`])/gi;
const maxIndexedFiles = 2_500;
const maxSelectedFiles = 24;
const maxSourceFileBytes = 512_000;
const maxFileCharacters = 14_000;
const maxContextCharacters = 140_000;
const queryStopWords = new Set(["the", "and", "for", "with", "from", "this", "that", "repo", "repository", "code", "review", "resume"]);

export type LocalRepositorySnapshot = {
  name: string;
  tree: string[];
  files: Array<{ path: string; content: string }>;
};

async function exists(candidate: string) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function isWorkspaceRoot(candidate: string) {
  if (await exists(path.join(candidate, ".git"))) return true;
  try {
    const packageJson = JSON.parse(await readFile(path.join(candidate, "package.json"), "utf8")) as { workspaces?: unknown };
    return Array.isArray(packageJson.workspaces) || Boolean(packageJson.workspaces);
  } catch {
    return false;
  }
}

export async function resolveLocalRepositoryRoot(start = process.cwd()) {
  const config = getConfig();
  const configured = config.LOCAL_REPOSITORY_ROOT;
  if (configured) {
    const root = path.resolve(configured);
    const stats = await lstat(root).catch(() => null);
    return stats?.isDirectory() ? root : null;
  }
  if (config.NODE_ENV === "production") return null;

  let candidate = path.resolve(start);
  while (true) {
    if (await isWorkspaceRoot(candidate)) return candidate;
    const parent = path.dirname(candidate);
    if (parent === candidate) return null;
    candidate = parent;
  }
}

function isReadableSourceFile(relativePath: string) {
  const basename = path.basename(relativePath);
  if (ignoredFiles.has(basename) || sensitiveNamePattern.test(basename)) return false;
  return exactTextFiles.has(basename) || textExtensions.has(path.extname(basename).toLowerCase());
}

function filePriority(relativePath: string, queryTerms: string[]) {
  const normalized = relativePath.toLowerCase();
  const basename = path.basename(normalized);
  const depth = normalized.split("/").length;
  let score = 0;
  if (/^readme(?:\.|$)/.test(basename)) score += depth === 1 ? 150 : 75;
  if (["package.json", "pyproject.toml", "cargo.toml", "go.mod", "dockerfile", "docker-compose.yml", "docker-compose.yaml"].includes(basename)) score += depth === 1 ? 130 : 95;
  if (/^(architecture|design|overview|features|api)\.(md|txt)$/.test(basename)) score += 120;
  if (normalized.includes("/app/") || normalized.includes("/src/")) score += 45;
  if (normalized.includes("/components/")) score += 52;
  if (normalized.includes("/routes/")) score += 18;
  if (normalized.includes("/services/")) score += 12;
  if (/(page|route|service|controller|component|provider|agent|coach|bot|repository)/.test(basename)) score += 38;
  if (/\.(css|scss)$/.test(basename)) score -= 25;
  if (/\.(test|spec)\.[^.]+$/.test(normalized) || normalized.includes("/tests/")) score -= 30;
  if (normalized.includes("generated") || normalized.includes("fixture")) score -= 50;
  score += queryTerms.filter((term) => normalized.includes(term)).length * 55;
  score -= depth;
  return score;
}

function redactSecrets(content: string) {
  return content.replace(
    redactedAssignmentPattern,
    (_match, key: string, separator: string, quote: string, _value: string, closingQuote: string) =>
      `${key}${separator}${quote}[REDACTED]${closingQuote}`,
  );
}

function boundedFileContent(content: string, limit: number) {
  if (content.length <= limit) return content;
  const half = Math.max(1, Math.floor((limit - 80) / 2));
  return `${content.slice(0, half)}\n\n[... middle of file omitted ...]\n\n${content.slice(-half)}`;
}

async function collectRepositoryFiles(root: string) {
  const collected: Array<{ absolutePath: string; path: string; size: number }> = [];
  const pending = [root];
  while (pending.length && collected.length < maxIndexedFiles) {
    const directory = pending.pop()!;
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (collected.length >= maxIndexedFiles) break;
      if (entry.isSymbolicLink()) continue;
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name) && !entry.name.startsWith(".")) pending.push(absolutePath);
        continue;
      }
      if (!entry.isFile() || !isReadableSourceFile(relativePath)) continue;
      const stats = await lstat(absolutePath).catch(() => null);
      if (!stats || stats.size > maxSourceFileBytes) continue;
      collected.push({ absolutePath, path: relativePath, size: stats.size });
    }
  }
  return collected;
}

export async function buildLocalRepositorySnapshot(root: string, query = ""): Promise<LocalRepositorySnapshot> {
  const candidates = await collectRepositoryFiles(root);
  const queryTerms = [...new Set(query.toLowerCase().match(/[a-z0-9_-]{3,}/g) ?? [])]
    .filter((term) => !queryStopWords.has(term))
    .slice(0, 12);
  const ranked = [...candidates]
    .sort((left, right) => filePriority(right.path, queryTerms) - filePriority(left.path, queryTerms) || left.path.localeCompare(right.path));
  const areaCounts = new Map<string, number>();
  const selected = ranked.filter((candidate) => {
    const area = candidate.path.includes("/") ? candidate.path.split("/", 1)[0] : "root";
    const count = areaCounts.get(area) ?? 0;
    if (count >= 6) return false;
    areaCounts.set(area, count + 1);
    return true;
  }).slice(0, maxSelectedFiles * 2);
  const files: LocalRepositorySnapshot["files"] = [];
  let totalCharacters = 0;
  for (const candidate of selected) {
    if (files.length >= maxSelectedFiles || totalCharacters >= maxContextCharacters) break;
    const raw = await readFile(candidate.absolutePath, "utf8").catch(() => "");
    if (!raw || raw.includes("\u0000")) continue;
    const remaining = maxContextCharacters - totalCharacters;
    const content = boundedFileContent(redactSecrets(raw), Math.min(remaining, maxFileCharacters));
    if (!content.trim()) continue;
    files.push({ path: candidate.path, content });
    totalCharacters += content.length;
  }
  return {
    name: path.basename(root),
    tree: candidates.map((candidate) => candidate.path).slice(0, 500),
    files,
  };
}

export function localRepositoryContext(snapshot: LocalRepositorySnapshot) {
  return [
    `Repository: ${snapshot.name}`,
    "Indexed source tree:",
    snapshot.tree.join("\n"),
    "",
    "Selected source files:",
    ...snapshot.files.map((file) => `\n--- ${file.path} ---\n${file.content}`),
  ].join("\n");
}
