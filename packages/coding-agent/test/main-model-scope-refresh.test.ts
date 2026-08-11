import { describe, expect, it } from "bun:test";
import type { Api, Model } from "@oh-my-pi/pi-ai";
import { buildModel } from "@oh-my-pi/pi-catalog/build";
import type { ModelRegistry } from "@oh-my-pi/pi-coding-agent/config/model-registry";
import { refreshMissingScopedModelProviders } from "@oh-my-pi/pi-coding-agent/main";

function gitLabModel(id: string): Model<Api> {
	return buildModel({
		id,
		name: id,
		api: "gitlab-duo-agent",
		provider: "gitlab-duo-agent",
		baseUrl: "https://gitlab.com",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200_000,
		maxTokens: 16_384,
	});
}

describe("refreshMissingScopedModelProviders", () => {
	it("loads a credential-scoped provider once before resolving its configured models", async () => {
		let available: Model<Api>[] = [gitLabModel("claude_sonnet_4_6_vertex")];
		const refreshed: string[] = [];
		const registry: Pick<ModelRegistry, "getAvailable" | "refreshProvider"> = {
			getAvailable: () => available,
			refreshProvider: async provider => {
				refreshed.push(provider);
				available = [gitLabModel("claude_sonnet_5"), gitLabModel("claude_opus_5")];
			},
		};

		await refreshMissingScopedModelProviders(
			["gitlab-duo-agent/claude_sonnet_5", "gitlab-duo-agent/claude_opus_5"],
			registry,
		);

		expect(refreshed).toEqual(["gitlab-duo-agent"]);
	});

	it("does not refresh when every configured model is already available", async () => {
		const refreshed: string[] = [];
		const registry: Pick<ModelRegistry, "getAvailable" | "refreshProvider"> = {
			getAvailable: () => [gitLabModel("claude_sonnet_5")],
			refreshProvider: async provider => {
				refreshed.push(provider);
			},
		};

		await refreshMissingScopedModelProviders(["gitlab-duo-agent/claude_sonnet_5"], registry);

		expect(refreshed).toEqual([]);
	});
});
