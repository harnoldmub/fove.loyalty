"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Button } from "./ui/button";

/**
 * Bascule clair / sombre. Le thème n'est connu qu'au navigateur : libellé
 * fixe et icône choisie par le CSS, pour que le rendu serveur et le rendu
 * client restent identiques (pas d'erreur d'hydratation).
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useTranslations("common.theme");
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label={t("toggle")}
      title={t("toggleTitle")}
    >
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}
