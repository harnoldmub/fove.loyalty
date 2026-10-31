/**
 * Applique au projet Android généré les réglages natifs requis.
 * Adapté de l'architecture mobile Jethro.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const variablesPath = resolve(root, "android/variables.gradle");
const manifestPath = resolve(root, "android/app/src/main/AndroidManifest.xml");

if (!existsSync(variablesPath)) {
  console.log("android/ absent ou non initialisé.");
  process.exit(0);
}

// Le scanner de codes-barres exige l'API 26 ; Capacitor génère 24 par défaut.
let variables = readFileSync(variablesPath, "utf8");
const before = variables;
variables = variables.replace(/minSdkVersion\s*=\s*\d+/, "minSdkVersion = 26");
if (variables !== before) {
  writeFileSync(variablesPath, variables);
  console.log("minSdkVersion porté à 26 (requis pour le scanner)");
}

// Permissions nécessaires au scan, vibrations haptiques et notifications.
const permissions = [
  "android.permission.CAMERA",
  "android.permission.VIBRATE",
  "android.permission.POST_NOTIFICATIONS",
];
let manifest = readFileSync(manifestPath, "utf8");
const missing = permissions.filter((permission) => !manifest.includes(permission));
if (missing.length) {
  const block = missing.map((permission) => `    <uses-permission android:name="${permission}" />`).join("\n");
  const feature = manifest.includes("android.hardware.camera")
    ? ""
    : '\n    <uses-feature android:name="android.hardware.camera" android:required="false" />';
  manifest = manifest.replace("</manifest>", `${block}${feature}\n</manifest>`);
  writeFileSync(manifestPath, manifest);
  console.log(`Permissions Android ajoutées : ${missing.join(", ")}`);
}

