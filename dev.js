import { spawn } from "bun";

const backend = spawn(["bun", "run", "index.js"], {
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});

const frontend = spawn(["bun", "run", "dev:frontend"], {
  stdout: "inherit",
  stderr: "inherit",
});

process.on("SIGINT", () => {
  backend.kill();
  frontend.kill();
});

await Promise.race([backend.exited, frontend.exited]);
backend.kill();
frontend.kill();
