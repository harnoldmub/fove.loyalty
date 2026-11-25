import { describe, expect, it } from "vitest";
import { isPublicIp, publicUrlProblem } from "./public-url";

describe("isPublicIp", () => {
  it("accepte les adresses publiques", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2001:4860:4860::8888"]) expect(isPublicIp(ip)).toBe(true);
  });

  it("refuse la boucle locale, les réseaux privés et internes", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.3.4", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "::", "fd12:3456::1", "fe80::1", "::ffff:10.0.0.1", "::ffff:127.0.0.1"]) {
      expect(isPublicIp(ip)).toBe(false);
    }
  });
});

describe("publicUrlProblem", () => {
  const resolveTo = (...ips: string[]) => async () => ips;

  it("accepte une adresse HTTPS qui résout vers Internet", async () => {
    expect(await publicUrlProblem("https://hooks.shop.example/fove", resolveTo("93.184.216.34"))).toBeNull();
  });

  it("refuse HTTP, les noms internes et les IP privées littérales", async () => {
    expect(await publicUrlProblem("http://hooks.shop.example/fove", resolveTo("93.184.216.34"))).toBe("https_required");
    expect(await publicUrlProblem("https://localhost/x", resolveTo("127.0.0.1"))).toBe("private_host");
    expect(await publicUrlProblem("https://api.railway.internal/x", resolveTo("fd00::1"))).toBe("private_host");
    expect(await publicUrlProblem("https://10.0.0.5/x")).toBe("private_host");
    expect(await publicUrlProblem("https://[::1]/x")).toBe("private_host");
  });

  it("refuse un nom public qui résout (même en partie) vers une adresse interne", async () => {
    expect(await publicUrlProblem("https://evil.example/x", resolveTo("93.184.216.34", "169.254.169.254"))).toBe("private_host");
  });

  it("refuse un nom introuvable", async () => {
    expect(await publicUrlProblem("https://nope.example/x", async () => { throw new Error("ENOTFOUND"); })).toBe("unresolvable_host");
  });
});
