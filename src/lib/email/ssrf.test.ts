import { describe, expect, it } from "vitest";
import { ipEInterno } from "./ssrf";

describe("ipEInterno", () => {
  it.each(["127.0.0.1", "10.1.2.3", "169.254.169.254", "172.16.0.1", "192.168.1.1", "::1", "fd00::1", "::ffff:10.0.0.1"])(
    "%s é interno",
    (ip) => expect(ipEInterno(ip)).toBe(true),
  );
  it.each(["8.8.8.8", "142.250.0.1", "2607:f8b0::1"])("%s é público", (ip) => expect(ipEInterno(ip)).toBe(false));
});
