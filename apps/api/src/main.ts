import { createApp } from "./bootstrap";
import { loadConfig } from "./config";

async function main() {
  const app = await createApp();
  const port = Number(process.env.PORT ?? loadConfig().API_PORT);
  await app.listen(port, "0.0.0.0");
  console.log(`FOVE API prête sur le port ${port}`);
}

void main();
