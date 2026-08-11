import { afterEach, describe, expect, it, vi } from "bun:test";
import type { AssistantMessage } from "@oh-my-pi/pi-ai";
import * as ai from "@oh-my-pi/pi-ai";
import { getBundledModel } from "@oh-my-pi/pi-catalog/models";
import {
	classifyObviousUnexpectedStop,
	classifyUnexpectedStop,
	isUnexpectedStopCandidate,
	parseUnexpectedStopClassification,
} from "@oh-my-pi/pi-coding-agent/session/unexpected-stop-classifier";

function makeAssistantMessage(options: {
	stopReason: AssistantMessage["stopReason"];
	content: AssistantMessage["content"];
}): AssistantMessage {
	return {
		role: "assistant",
		provider: "mock",
		model: "mock/mock",
		api: "mock" as unknown as AssistantMessage["api"],
		content: options.content,
		stopReason: options.stopReason,
		timestamp: Date.now(),
	} as unknown as AssistantMessage;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("isUnexpectedStopCandidate", () => {
	it("returns true for a text-only stop", () => {
		const message = makeAssistantMessage({
			stopReason: "stop",
			content: [{ type: "text", text: "I should do the same for the JS eval worker." }],
		});
		expect(isUnexpectedStopCandidate(message)).toBe(true);
	});

	it("returns false when stopReason is not stop", () => {
		const length = makeAssistantMessage({
			stopReason: "length",
			content: [{ type: "text", text: "I should continue." }],
		});
		expect(isUnexpectedStopCandidate(length)).toBe(false);

		const aborted = makeAssistantMessage({
			stopReason: "aborted",
			content: [{ type: "text", text: "I should continue." }],
		});
		expect(isUnexpectedStopCandidate(aborted)).toBe(false);
	});

	it("returns false when the message contains a toolCall", () => {
		const message = makeAssistantMessage({
			stopReason: "stop",
			content: [
				{ type: "text", text: "I will run the tests now." },
				{ type: "toolCall", id: "call-1", name: "bash", arguments: {} },
			],
		});
		expect(isUnexpectedStopCandidate(message)).toBe(false);
	});

	it("returns false when the text is only whitespace", () => {
		const message = makeAssistantMessage({
			stopReason: "stop",
			content: [{ type: "text", text: "   \n\t  " }],
		});
		expect(isUnexpectedStopCandidate(message)).toBe(false);
	});

	it("returns false for an empty stop", () => {
		const message = makeAssistantMessage({
			stopReason: "stop",
			content: [],
		});
		expect(isUnexpectedStopCandidate(message)).toBe(false);
	});

	it("returns true for a signed thinking-only stop", () => {
		const message = makeAssistantMessage({
			stopReason: "stop",
			content: [{ type: "thinking", thinking: " 响应", thinkingSignature: "reasoning_content" }],
		});
		expect(isUnexpectedStopCandidate(message)).toBe(true);
	});

	it("returns false for an unsigned thinking-only stop (empty-stop path owns it)", () => {
		const message = makeAssistantMessage({
			stopReason: "stop",
			content: [{ type: "thinking", thinking: "responseAll four reviewers complete." }],
		});
		expect(isUnexpectedStopCandidate(message)).toBe(false);
	});

	it("returns false when the thinking block is only whitespace", () => {
		const message = makeAssistantMessage({
			stopReason: "stop",
			content: [{ type: "thinking", thinking: "   \n\t  ", thinkingSignature: "reasoning_content" }],
		});
		expect(isUnexpectedStopCandidate(message)).toBe(false);
	});
});

describe("classifyUnexpectedStop", () => {
	it("recognizes an explicit Russian false tool-channel refusal without a model request", async () => {
		expect(
			classifyObviousUnexpectedStop(
				"Не могу продолжить: интерфейс этой сессии не предоставил рабочий канал вызова инструментов.",
			),
		).toBe(true);
	});

	it("recognizes the observed Russian tool-interface refusal", () => {
		expect(
			classifyObviousUnexpectedStop(
				"Начинаю read-only аудит. Не могу выполнить аудит: интерфейс инструментов в этой сессии не позволяет фактически вызвать task, glob и read.",
			),
		).toBe(true);
	});

	it("recognizes the observed missing-read refusal after earlier tools ran", () => {
		expect(
			classifyObviousUnexpectedStop(
				"Читаю конфигурацию и тесты. Не могу завершить аудит: обязательный вызов read отсутствует в предоставленном логе.",
			),
		).toBe(true);
	});

	it("recognizes the observed not-called-tools refusal", () => {
		expect(
			classifyObviousUnexpectedStop(
				"Структура получена. Не могу завершить аудит: обязательные grep и read не были вызваны.",
			),
		).toBe(true);
	});

	it("recognizes the observed failed-agent-result refusal", () => {
		expect(
			classifyObviousUnexpectedStop(
				"Не удалось завершить аудит: результат scout недоступен через agent://SecureHerring; последующие glob и read не выполнялись.",
			),
		).toBe(true);
	});

	it("recognizes a stopped cleanup action followed by a terse audit failure", () => {
		expect(
			classifyObviousUnexpectedStop(
				"Исключаю build-артефакты и сопоставляю маркеры с объявлениями символов. Не удалось завершить аудит.",
			),
		).toBe(true);
	});

	it("recognizes a parent that stopped while waiting for a running scout", () => {
		expect(classifyObviousUnexpectedStop("Scout ещё выполняется; ожидаю автоматическую доставку результата.")).toBe(
			true,
		);
	});

	it("recognizes a Russian action promise that stopped before the action", () => {
		expect(
			classifyObviousUnexpectedStop("Проверю исходники и незавершённые места, затем соберу и запущу приложение."),
		).toBe(true);
	});

	it("recognizes the observed image-generation promise followed by a tool-access refusal", () => {
		expect(
			classifyObviousUnexpectedStop(
				"Генерирую недостающие изображения, сохраняю все четыре в проект и встраиваю их в страницу.Продолжу после восстановления доступа к инструментам.",
			),
		).toBe(true);
	});

	it("recognizes the observed unfinished file-operation promises", () => {
		expect(
			classifyObviousUnexpectedStop(
				"Доделываю: последний портрет, перенос трёх файлов, интеграция и проверка в Chromium.Не могу выполнить файловые операции и генерацию в текущем ответе.",
			),
		).toBe(true);
		expect(
			classifyObviousUnexpectedStop(
				"Встраиваю изображения и проверяю файлы и поведение страницы.Продолжение невозможно без нового запроса: в текущем сообщении нет доступного вызова файлового инструмента.",
			),
		).toBe(true);
	});

	it("leaves a completed status report to the configured classifier", () => {
		expect(classifyObviousUnexpectedStop("Проверка завершена. Все тесты проходят.")).toBeUndefined();
	});

	it("uses a reasoning-safe online classifier budget when the catalog disables reasoning", async () => {
		const baseModel = getBundledModel("anthropic", "claude-sonnet-4-5");
		if (!baseModel) throw new Error("Expected bundled Claude Sonnet 4.5 model");
		const model = { ...baseModel, reasoning: false };
		const settings = {
			get(path: string) {
				if (path === "providers.unexpectedStopModel") return "online";
				return undefined;
			},
			getModelRole(role: string) {
				return role === "smol" ? `${model.provider}/${model.id}` : undefined;
			},
			getStorage() {
				return undefined;
			},
		} as never;
		const registry = {
			getAvailable: () => [model],
			getApiKey: async () => "test-key",
			resolver: () => async () => "test-key",
		} as never;
		const completeSimpleMock = vi.spyOn(ai, "completeSimple").mockResolvedValue({
			stopReason: "stop",
			content: [{ type: "text", text: "YES" }],
		} as never);

		const result = await classifyUnexpectedStop("I will continue with the next command.", {
			settings,
			registry,
			sessionId: "session-1",
		});
		const options = completeSimpleMock.mock.calls[0]?.[2] as
			| { disableReasoning?: boolean; maxTokens?: number }
			| undefined;

		expect(result).toBe(true);
		expect(options).toMatchObject({ disableReasoning: true, maxTokens: 1024 });
	});
});

describe("parseUnexpectedStopClassification", () => {
	it("returns true for YES output", () => {
		expect(parseUnexpectedStopClassification("YES")).toBe(true);
		expect(parseUnexpectedStopClassification("yes")).toBe(true);
		expect(parseUnexpectedStopClassification("  Yes, this is unexpected  ")).toBe(true);
	});

	it("returns false for NO output", () => {
		expect(parseUnexpectedStopClassification("NO")).toBe(false);
		expect(parseUnexpectedStopClassification("no")).toBe(false);
		expect(parseUnexpectedStopClassification("No, the task is complete.")).toBe(false);
	});

	it("returns undefined for unparseable output", () => {
		expect(parseUnexpectedStopClassification("maybe")).toBeUndefined();
		expect(parseUnexpectedStopClassification("")).toBeUndefined();
		expect(parseUnexpectedStopClassification("I don't know")).toBeUndefined();
	});
});
