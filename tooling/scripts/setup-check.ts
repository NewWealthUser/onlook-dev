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

const envLocalRelativePath = path.join("apps", "web", "client", ".env.local");
const envLocalPath = path.join(process.cwd(), envLocalRelativePath);
const envLocalContents = [
    "NODE_ENV=development",
    "NEXT_PUBLIC_SITE_URL=http://localhost:3000",
    "ONLOOK_PROJECTS_DIR=\"$HOME/Onlook Projects\"",
    ""
].join("\n");

let envLocalStatus: Status = "pass";
let envLocalNote = "";

try {
    await fs.access(envLocalPath, fsConstants.F_OK);
    envLocalNote = `Found ${envLocalRelativePath}`;
} catch {
    try {
        await fs.writeFile(envLocalPath, envLocalContents, { flag: "wx" });
        envLocalNote = `Created ${envLocalRelativePath}`;
    } catch (error) {
        envLocalStatus = "fail";
        const message = error instanceof Error ? error.message : String(error);
        envLocalNote = `Unable to create ${envLocalRelativePath}: ${message}`;
    }
}

results.push({
    label: ".env.local",
    status: envLocalStatus,
    note: envLocalNote
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
