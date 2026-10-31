/**
 * Pont natif Capacitor pour iOS et Android.
 * Fournit les retours haptiques (Taptic Engine sur iPhone), la gestion de la barre d'état et du clavier.
 */
export async function isNativePlatform(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function hapticImpact(style: "heavy" | "medium" | "light" = "medium"): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      const mapped =
        style === "heavy" ? ImpactStyle.Heavy : style === "light" ? ImpactStyle.Light : ImpactStyle.Medium;
      await Haptics.impact({ style: mapped });
      return;
    }
  } catch {
    // fallback web
  }
  navigator.vibrate?.(style === "heavy" ? 100 : style === "light" ? 30 : 60);
}

export async function hapticNotification(type: "success" | "warning" | "error"): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Haptics, NotificationType } = await import("@capacitor/haptics");
      const mapped =
        type === "success"
          ? NotificationType.Success
          : type === "warning"
            ? NotificationType.Warning
            : NotificationType.Error;
      await Haptics.notification({ type: mapped });
      return;
    }
  } catch {
    // fallback web
  }
  navigator.vibrate?.(type === "error" ? [80, 40, 80] : 60);
}

export async function initNativeApp(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;

    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
  } catch {
    // ignored
  }
}

