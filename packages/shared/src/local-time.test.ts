import { describe, expect, it } from "vitest";
import { birthdayInYear, birthdayOffset, isLocalHourBetween, localDateKey, safeTimeZone, zonedParts } from "./local-time";

describe("heure locale d'un commerce", () => {
  it("même instant UTC, jour et heure différents selon le fuseau", () => {
    const instant = new Date("2026-11-28T23:30:00Z");
    expect(localDateKey(instant, "Africa/Kinshasa")).toBe("2026-11-29");
    expect(localDateKey(instant, "America/Mexico_City")).toBe("2026-11-28");
    expect(zonedParts(instant, "Europe/Paris").hour).toBe(0);
  });

  it("heure d'été prise en compte (Paris)", () => {
    expect(zonedParts(new Date("2026-07-01T08:00:00Z"), "Europe/Paris").hour).toBe(10);
    expect(zonedParts(new Date("2026-12-01T08:00:00Z"), "Europe/Paris").hour).toBe(9);
  });

  it("plage d'envoi 10 h – 19 h", () => {
    expect(isLocalHourBetween(new Date("2026-11-28T09:00:00Z"), "Africa/Lagos", 10, 19)).toBe(true);
    expect(isLocalHourBetween(new Date("2026-11-28T18:30:00Z"), "Africa/Kinshasa", 10, 19)).toBe(false);
  });

  it("fuseau inconnu : celui par défaut", () => {
    expect(safeTimeZone("Mars/Olympus")).toBe("Africa/Kinshasa");
    expect(safeTimeZone("Europe/Paris")).toBe("Europe/Paris");
  });
});

describe("anniversaire", () => {
  it("29 février les années non bissextiles : le 28", () => {
    expect(birthdayInYear(29, 2, 2027)).toEqual({ year: 2027, month: 2, day: 28 });
    expect(birthdayInYear(29, 2, 2028)).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it("position du jour par rapport à l'anniversaire, passage d'année compris", () => {
    expect(birthdayOffset({ year: 2026, month: 3, day: 12 }, 12, 3)).toBe(0);
    expect(birthdayOffset({ year: 2026, month: 3, day: 9 }, 12, 3)).toBe(-3);
    expect(birthdayOffset({ year: 2026, month: 3, day: 19 }, 12, 3)).toBe(7);
    expect(birthdayOffset({ year: 2026, month: 12, day: 30 }, 2, 1)).toBe(-3);
    expect(birthdayOffset({ year: 2027, month: 1, day: 5 }, 30, 12)).toBe(6);
  });
});

describe("minuit local", () => {
  it("Kinshasa (UTC+1) et Paris en été (UTC+2)", async () => {
    const { localMidnightUtc, addLocalDays } = await import("./local-time");
    expect(localMidnightUtc({ year: 2026, month: 3, day: 12 }, "Africa/Kinshasa").toISOString()).toBe("2026-03-11T23:00:00.000Z");
    expect(localMidnightUtc({ year: 2026, month: 7, day: 1 }, "Europe/Paris").toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(addLocalDays({ year: 2026, month: 12, day: 30 }, 3)).toEqual({ year: 2027, month: 1, day: 2 });
  });
});
