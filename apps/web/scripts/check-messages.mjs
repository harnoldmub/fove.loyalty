/**
 * Vérifie que chaque langue a exactement les mêmes clés que le français.
 *   node scripts/check-messages.mjs
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../messages");
const flat = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

let errors = 0;
for (const file of readdirSync(`${dir}/fr`)) {
  const ref = new Set(flat(JSON.parse(readFileSync(`${dir}/fr/${file}`, "utf8"))));
  for (const locale of ["en", "ar", "es"]) {
    let keys;
    try {
      keys = new Set(flat(JSON.parse(readFileSync(`${dir}/${locale}/${file}`, "utf8"))));
    } catch (e) {
      console.error(`${locale}/${file} : illisible (${e.message})`);
      errors++;
      continue;
    }
    const missing = [...ref].filter((k) => !keys.has(k));
    const extra = [...keys].filter((k) => !ref.has(k));
    if (missing.length) console.error(`${locale}/${file} : ${missing.length} clé(s) manquante(s) : ${missing.slice(0, 8).join(", ")}`);
    if (extra.length) console.error(`${locale}/${file} : ${extra.length} clé(s) en trop : ${extra.slice(0, 8).join(", ")}`);
    errors += missing.length + extra.length;
  }
}
if (errors) process.exit(1);
console.log("Messages cohérents dans les 4 langues.");
