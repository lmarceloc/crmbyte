// Workers Builds (Cloudflare) às vezes restaura o cache de dependências sem o
// binário opcional do workerd, e o `opennextjs-cloudflare build` quebra com
// 'The package "@cloudflare/workerd-linux-64" could not be found'.
// Só age no Linux x64 do build da Cloudflare (WORKERS_CI=1).
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = "@cloudflare/workerd-linux-64";

if (process.env.WORKERS_CI && process.platform === "linux" && process.arch === "x64") {
  try {
    require.resolve(`${pkg}/package.json`);
  } catch {
    const { version } = require("workerd/package.json");
    console.log(`[ensure-workerd] instalando ${pkg}@${version}`);
    execSync(`npm install --no-save --no-audit --no-fund ${pkg}@${version}`, { stdio: "inherit" });
  }
}
