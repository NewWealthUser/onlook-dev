import { promises as fs, constants as fsConstants } from "fs";
import os from "os";
import path from "path";

const statusSymbols = {
    pass: "✅",
    fail: "❌",
    info: "ℹ️"
} as const;

type Status = keyof typeof statusSymbols;

type CheckResult = {
    label: string;
    status: Status;
    note: string;
};

const results: CheckResult[] = [];

const bunVersion = Bun.version;
results.push({
    label: "Bun",
    status: "pass",
    note: `v${bunVersion}`
});

const platform = process.platform;
const isMac = platform === "darwin";
results.push({
    label: "Platform",
    status: "info",
    note: isMac ? "macOS" : `${platform} (non-macOS)`
});

const homeDirectory = os.homedir();
const projectsDirName = "Onlook Projects";
const projectsDir = path.join(homeDirectory, projectsDirName);

let projectsStatus: Status = "pass";
let projectsNote = "";

try {
    await fs.mkdir(projectsDir, { recursive: true });
    await fs.access(projectsDir, fsConstants.W_OK);
    projectsNote = `Writable at ${projectsDir}${isMac ? "" : " (checked outside macOS)"}`;
} catch (error) {
    projectsStatus = "fail";
    const message = error instanceof Error ? error.message : String(error);
    projectsNote = `Failed to verify access at ${projectsDir}: ${message}`;
}

results.push({
    label: "~/Onlook Projects",
    status: projectsStatus,
    note: projectsNote
});

const lines: string[] = [
    "# Setup Check",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    ...results.map(({ label, status, note }) => `- ${statusSymbols[status]} ${label}: ${note}`),
    ""
];

await fs.writeFile("SETUP_CHECK.md", lines.join("\n"), "utf8");

for (const { label, status, note } of results) {
    console.log(`${statusSymbols[status]} ${label}: ${note}`);
}

if (results.some(({ status }) => status === "fail")) {
    process.exit(1);
}
