import { describe, expect, it } from "bun:test";
import { repairHubParams } from "@oh-my-pi/pi-coding-agent/tools/hub";

describe("repairHubParams", () => {
	it("repairs a bash-shaped start command into application and argv", () => {
		expect(
			repairHubParams({
				op: "start",
				name: "night-arsenal-http",
				command: "python3 -m http.server 8765",
				cwd: "/tmp/site",
			}),
		).toEqual({
			op: "start",
			name: "night-arsenal-http",
			application: "python3",
			args: ["-m", "http.server", "8765"],
			cwd: "/tmp/site",
		});
	});

	it("preserves an explicit application", () => {
		const params = {
			op: "start" as const,
			application: "python3",
			args: ["-m", "http.server", "8765"],
		};
		expect(repairHubParams(params)).toBe(params);
	});

	it("splits quoted argv without evaluating shell syntax", () => {
		expect(repairHubParams({ op: "start", command: "python3 -c 'print(42)' &" })).toEqual({
			op: "start",
			application: "python3",
			args: ["-c", "print(42)", "&"],
		});
	});
});
