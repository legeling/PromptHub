import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAgentProviderStore } from "../../../src/renderer/stores/agent-provider.store";
import { AgentProviderProfileWorkbench } from "../../../src/renderer/components/agent/AgentProviderProfileWorkbench";
import { renderWithI18n } from "../../helpers/i18n";
import {
  activationPlan,
  chooseProviderFormOption,
  createAgent,
  profile,
  renderWorkbench,
  resetProviderWorkbenchTestState,
} from "./agent-provider-profile-workbench.harness";

describe("AgentProviderProfileWorkbench", () => {
  beforeEach(() => {
    resetProviderWorkbenchTestState();
  });

  it("does not request native profiles during a transition to an unsupported Agent", async () => {
    const agent = createAgent("antigravity");
    agent.capabilities.provider = { status: "planned" };
    await renderWithI18n(<AgentProviderProfileWorkbench agent={agent} />);
    expect(window.api.agent.listProviderProfiles).not.toHaveBeenCalled();
  });

  it("keeps CLI authentication platform-managed and hides unsupported provider import", async () => {
    window.api.agent.listProviderProfiles = vi
      .fn()
      .mockResolvedValue([
        profile({ platformId: "antigravity-cli", secretState: "none" }),
      ]);
    await renderWorkbench(createAgent("antigravity-cli"));
    expect(screen.getByText("Managed by the platform")).toBeVisible();
    expect(
      screen.queryByText("No credential configured"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Import from PromptHub")).not.toBeInTheDocument();
  });

  it("loads the selected platform profile and shows only public readiness data", async () => {
    window.api.agent.listProviderProfiles = vi
      .fn()
      .mockResolvedValue([profile({ secretState: "available" })]);

    await renderWorkbench();

    expect(screen.getByTestId("agent-provider-workbench")).toBeVisible();
    const toolbar = screen.getByTestId("agent-provider-workbench-toolbar");
    expect(toolbar).toBeVisible();
    expect(
      within(toolbar).queryByText("Import current configuration"),
    ).not.toBeInTheDocument();
    expect(within(toolbar).getByText("Import from PromptHub")).toBeVisible();
    expect(within(toolbar).getByText("Add custom provider")).toBeVisible();
    expect(toolbar.querySelectorAll("svg.lucide-plus")).toHaveLength(2);
    expect(screen.getByTestId("agent-provider-workbench-sidebar")).toHaveClass(
      "overflow-hidden",
    );
    expect(screen.getByRole("navigation", { name: "Providers" })).toHaveClass(
      "h-full",
      "overflow-x-hidden",
      "overflow-y-auto",
    );
    expect(window.api.agent.listProviderProfiles).toHaveBeenCalledWith({
      platformId: "claude",
    });
    expect(
      await screen.findByRole("button", { name: /Claude production/ }),
    ).toHaveAttribute("aria-current", "true");
    expect(screen.getAllByText("claude-sonnet-4").length).toBeGreaterThan(0);
    expect(screen.getByText("Credential available")).toBeVisible();
    expect(screen.queryByText(/agent-provider:/)).not.toBeInTheDocument();
  });

  it("offers provider creation and PromptHub import from the provider-list context menu", async () => {
    await renderWorkbench();

    const providers = screen.getByRole("navigation", { name: "Providers" });
    fireEvent.contextMenu(providers, { clientX: 80, clientY: 120 });

    const importFromMenu = screen.getAllByRole("button", {
      name: "Import from PromptHub",
    })[1];
    expect(importFromMenu).toBeVisible();
    fireEvent.click(importFromMenu);
    const importDialog = await screen.findByRole("dialog", {
      name: "Import PromptHub provider",
    });
    fireEvent.click(
      within(importDialog).getByRole("button", { name: "Close" }),
    );

    fireEvent.contextMenu(providers, { clientX: 80, clientY: 120 });
    const addCustom = screen.getAllByRole("button", {
      name: "Add custom provider",
    })[1];
    expect(addCustom).toBeVisible();
    fireEvent.click(addCustom);

    expect(
      await screen.findByRole("region", { name: "Add provider" }),
    ).toBeVisible();
  });

  it("uses Web-specific empty copy without promising native import or activation", async () => {
    (window as Window & { __PROMPTHUB_WEB__?: boolean }).__PROMPTHUB_WEB__ =
      true;
    window.api.agent.listProviderProfiles = vi.fn().mockResolvedValue([]);

    try {
      await renderWorkbench();

      expect(
        screen.getByText("No providers yet. Add one to manage this Agent."),
      ).toBeVisible();
      expect(
        screen.getByText(
          "Add a provider to store model settings and write-only credentials on this server.",
        ),
      ).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Add custom provider" }),
      ).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Import from PromptHub" }),
      ).not.toBeInTheDocument();

      const providers = screen.getByRole("navigation", { name: "Providers" });
      fireEvent.contextMenu(providers, { clientX: 80, clientY: 120 });
      expect(
        screen.queryByRole("button", { name: "Import from PromptHub" }),
      ).not.toBeInTheDocument();
      fireEvent.click(
        screen.getAllByRole("button", { name: "Add custom provider" })[1],
      );
      expect(
        await screen.findByRole("region", { name: "Add provider" }),
      ).toBeVisible();

      expect(
        screen.queryByText(/native configuration/i),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/activation/i)).not.toBeInTheDocument();
    } finally {
      delete (window as Window & { __PROMPTHUB_WEB__?: boolean })
        .__PROMPTHUB_WEB__;
    }
  });

  it("shows the current native provider as read-only and previews official restore", async () => {
    const officialProfile = profile({
      id: "profile-official",
      name: "Anthropic Official",
      providerKind: "anthropic",
      protocol: "platform-native",
      modelMappings: [
        {
          id: "mapping-official",
          providerProfileId: "profile-official",
          routeKey: "primary",
          modelId: "opus[1m]",
          parameters: {},
        },
      ],
    });
    window.api.agent.listProviderProfiles = vi.fn().mockResolvedValue([]);
    window.api.agent.getProviderCurrentState = vi.fn().mockResolvedValue({
      platformId: "claude",
      status: "none",
      currentProfileId: null,
      nativeConfig: {
        classification: "custom",
        name: "Claude custom provider",
        providerKind: "custom",
        protocol: "anthropic-messages",
        endpoint: "https://api.kimi.com/coding",
        model: "opus[1m]",
        credential: "configured-auth-token",
        officialRestoreAvailable: true,
      },
      checkedAt: 1_700_000_000_000,
    });
    window.api.agent.ensureOfficialProviderProfile = vi
      .fn()
      .mockResolvedValue(officialProfile);
    window.api.agent.previewProviderActivation = vi.fn().mockResolvedValue(
      activationPlan({
        profileId: officialProfile.id,
        status: "apply",
        canApply: true,
        requiresReview: false,
        decisions: [],
      }),
    );

    await renderWorkbench();

    expect(
      screen.getByRole("button", { name: /Current native configuration/ }),
    ).toBeVisible();
    expect(screen.getAllByText("Custom provider")).toHaveLength(2);
    expect(screen.getByText("https://api.kimi.com/coding")).toBeVisible();
    expect(screen.getAllByText("opus[1m]").length).toBeGreaterThan(0);
    expect(screen.getByText("Configured auth token")).toBeVisible();
    expect(screen.queryByText(/sk-|agent-provider:/i)).not.toBeInTheDocument();
    const nativeRow = screen.getByTestId("provider-native-card");
    const nativeTitle = within(nativeRow).getByText(
      "Current native configuration",
    );
    expect(nativeTitle).not.toHaveClass("truncate");
    expect(nativeTitle).toHaveClass("break-words");
    expect(nativeTitle.parentElement).toHaveClass("flex-col", "items-start");
    expect(nativeRow).toHaveClass("rounded-lg", "border", "bg-card");
    expect(nativeRow).not.toHaveClass("m-1", "w-[calc(100%-0.5rem)]");
    expect(nativeRow.parentElement).toHaveClass("p-1");
    expect(nativeRow).not.toHaveClass("border-b");
    expect(
      screen.queryByText(
        "This native configuration remains owned by the Agent and is read-only here.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Create editable|Import current/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("switch", {
        name: "Current active provider: Claude custom provider",
      }),
    ).toBeChecked();

    fireEvent.click(
      screen.getByRole("button", { name: "Restore official configuration" }),
    );

    await waitFor(() =>
      expect(
        window.api.agent.ensureOfficialProviderProfile,
      ).toHaveBeenCalledWith("claude"),
    );
    expect(window.api.agent.previewProviderActivation).toHaveBeenCalledWith({
      agentId: "claude",
      profileId: officialProfile.id,
    });
    expect(
      await screen.findByRole("dialog", {
        name: "Review provider activation",
      }),
    ).toBeVisible();
  });

  it("offers official connection and model tests for platform-native Codex", async () => {
    window.api.agent.listProviderProfiles = vi.fn().mockResolvedValue([]);
    window.api.agent.testCurrentProviderConnection = vi.fn().mockResolvedValue({
      platformId: "codex",
      profileId: "native:codex",
      protocol: "platform-native",
      endpointOrigin: null,
      model: "gpt-5.6-sol",
      status: "ok",
      startedAt: 10,
      finishedAt: 12,
      totalMs: 2,
      retryCount: 0,
      modelCount: null,
      modelAvailable: null,
    });
    window.api.agent.testCurrentProviderModel = vi.fn().mockResolvedValue({
      platformId: "codex",
      profileId: "native:codex",
      protocol: "platform-native",
      endpointOrigin: null,
      model: "gpt-5.6-sol",
      status: "protocol-error",
      startedAt: 10,
      finishedAt: 213,
      totalMs: 203,
      firstTokenMs: null,
      retryCount: 0,
      inputTokens: null,
      outputTokens: null,
      outputPreview: null,
      errorCode: "codex-model-test-failed",
    });
    window.api.agent.getProviderCurrentState = vi.fn().mockResolvedValue({
      platformId: "codex",
      status: "none",
      currentProfileId: null,
      nativeConfig: {
        classification: "official",
        name: "OpenAI",
        providerKind: "openai",
        protocol: "platform-native",
        endpoint: null,
        model: "gpt-5.6-sol",
        credential: "platform-managed",
        officialRestoreAvailable: false,
      },
      checkedAt: 1_700_000_000_000,
    });
    await renderWorkbench(createAgent("codex"));

    expect(screen.getByText("Connection check")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    await waitFor(() =>
      expect(
        window.api.agent.testCurrentProviderConnection,
      ).toHaveBeenCalledWith({ agentId: "codex" }),
    );
    expect(await screen.findByText("Connection successful")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Test model" }));
    const confirmation = await screen.findByRole("alertdialog", {
      name: "Run model test?",
    });
    expect(window.api.agent.testCurrentProviderModel).not.toHaveBeenCalled();
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Run test" }),
    );
    expect(
      await screen.findByText("Official Codex CLI test failed"),
    ).toBeVisible();
    expect(
      screen.queryByText("Provider returned an invalid stream"),
    ).not.toBeInTheDocument();
    expect(window.api.agent.createProviderProfile).not.toHaveBeenCalled();
    expect(
      window.api.agent.ensureOfficialProviderProfile,
    ).not.toHaveBeenCalled();
  });

  it("does not expose the internal import source on provider list rows", async () => {
    window.api.agent.listProviderProfiles = vi.fn().mockResolvedValue([
      profile({
        id: "profile-imported",
        name: "DeepSeek",
        source: "import",
      }),
    ]);

    await renderWorkbench(createAgent("codex"));

    const providerRow = screen.getByRole("button", { name: /DeepSeek/ });
    expect(within(providerRow).queryByText("Import")).not.toBeInTheDocument();
  });

  it("imports a compatible PromptHub provider and explains incompatible sources", async () => {
    const imported = profile({
      id: "profile-imported",
      platformId: "codex",
      name: "Work Gateway",
      source: "import",
    });
    window.api.agent.listProviderSources = vi.fn().mockResolvedValue([
      {
        source: "prompthub",
        sourceId: "provider-work",
        name: "Work Gateway",
        providerKind: "deepseek",
        protocol: "openai-chat",
        protocols: ["openai-chat", "openai-responses"],
        endpoint: "https://gateway.example.com/v1",
        credentialReady: false,
        compatible: true,
        incompatibility: null,
        models: [
          {
            id: "model-work",
            name: "GPT Work",
            model: "gpt-work",
            isDefault: true,
          },
        ],
      },
      {
        source: "prompthub",
        sourceId: "provider-anthropic",
        name: "Anthropic Direct",
        providerKind: "anthropic",
        protocol: null,
        protocols: [],
        endpoint: "https://api.anthropic.com",
        credentialReady: true,
        compatible: false,
        incompatibility: "protocol-unsupported",
        models: [
          {
            id: "model-anthropic",
            name: "Claude Work",
            model: "claude-work",
            isDefault: false,
          },
        ],
      },
    ]);
    window.api.agent.importProviderSource = vi.fn().mockResolvedValue(imported);

    await renderWorkbench(createAgent("codex"));
    fireEvent.click(
      screen.getByRole("button", { name: "Import from PromptHub" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Import PromptHub provider",
    });
    expect(window.api.agent.listProviderSources).toHaveBeenCalledWith("codex");
    expect(within(dialog).getByText("Work Gateway")).toBeVisible();
    expect(within(dialog).getByRole("img", { name: "DeepSeek" })).toBeVisible();
    expect(
      await within(dialog).findByRole("img", { name: "GPT" }),
    ).toBeVisible();
    expect(within(dialog).getByText("Anthropic Direct")).toBeVisible();
    expect(within(dialog).getByText("Protocol is not supported")).toBeVisible();
    expect(
      within(dialog).getByText("Credential must be added after import"),
    ).toBeVisible();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: /DeepSeekWork Gatewaydeepseek/,
      }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Model" }));
    fireEvent.click(
      await screen.findByRole("option", { name: "GPT Work (gpt-work)" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Protocol" }));
    fireEvent.click(
      await screen.findByRole("option", { name: "OpenAI Responses" }),
    );
    const importButton = within(dialog).getByRole("button", { name: "Import" });
    await waitFor(() => expect(importButton).toBeEnabled());
    fireEvent.click(importButton);

    await waitFor(() =>
      expect(window.api.agent.importProviderSource).toHaveBeenCalledWith({
        platformId: "codex",
        sourceId: "provider-work",
        modelId: "model-work",
        protocol: "openai-responses",
      }),
    );
    expect(
      await screen.findByRole("button", { name: /Work Gateway/ }),
    ).toBeVisible();
    expect(
      screen.queryByRole("dialog", { name: "Import PromptHub provider" }),
    ).not.toBeInTheDocument();
  });

  it("marks only the native-verified current profile and disables redundant activation", async () => {
    window.api.agent.listProviderProfiles = vi
      .fn()
      .mockResolvedValue([
        profile(),
        profile({ id: "profile-2", name: "Lab" }),
      ]);
    window.api.agent.getProviderCurrentState = vi.fn().mockResolvedValue({
      platformId: "claude",
      status: "verified",
      currentProfileId: "profile-1",
      nativeConfig: null,
      checkedAt: 1_700_000_000_000,
    });

    await renderWorkbench();

    await screen.findByRole("button", {
      name: /Claude production/,
    });
    const currentSwitch = screen.getByRole("switch", {
      name: "Current active provider: Claude production",
    });
    expect(currentSwitch).toBeChecked();
    expect(currentSwitch).toBeDisabled();

    const labSwitch = screen.getByRole("switch", { name: "Activate Lab" });
    expect(labSwitch).not.toBeChecked();
    expect(labSwitch).toBeEnabled();
  });

  it("does not claim a stale or unavailable Profile is current", async () => {
    window.api.agent.listProviderProfiles = vi
      .fn()
      .mockResolvedValue([profile()]);
    window.api.agent.getProviderCurrentState = vi.fn().mockResolvedValue({
      platformId: "claude",
      status: "stale",
      currentProfileId: null,
      nativeConfig: null,
      checkedAt: 1_700_000_000_000,
    });

    await renderWorkbench();

    expect(screen.queryByText("Current")).not.toBeInTheDocument();
    expect(screen.getByText("Native configuration changed")).toBeVisible();
    expect(
      screen.getByRole("switch", { name: "Activate Claude production" }),
    ).toBeEnabled();
  });

  it("runs an isolated supported Profile connection test and renders its result", async () => {
    const geminiProfile = profile({
      platformId: "gemini",
      name: "Gemini paid API",
      providerKind: "google-gemini",
      protocol: "google-generative-language",
      endpoint: "https://generativelanguage.googleapis.com",
      secretState: "available",
      modelMappings: [
        {
          id: "mapping-gemini",
          providerProfileId: "profile-1",
          routeKey: "primary",
          modelId: "gemini-2.5-pro",
          parameters: {},
        },
      ],
    });
    window.api.agent.listProviderProfiles = vi
      .fn()
      .mockResolvedValue([geminiProfile]);
    const successfulResult = {
      platformId: "gemini",
      profileId: "profile-1",
      protocol: "google-generative-language",
      endpointOrigin: "https://generativelanguage.googleapis.com",
      model: "gemini-2.5-pro",
      status: "ok",
      startedAt: 10,
      finishedAt: 20,
      totalMs: 10,
      retryCount: 0,
      modelCount: 2,
      modelAvailable: true,
    } as const;
    let finishConnection: ((value: typeof successfulResult) => void) | null =
      null;
    window.api.agent.testProviderConnection = vi.fn().mockImplementation(
      () =>
        new Promise<typeof successfulResult>((resolve) => {
          finishConnection = resolve;
        }),
    );

    await renderWorkbench(createAgent("gemini"));
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

    expect(
      await screen.findByRole("button", { name: "Testing..." }),
    ).toBeDisabled();
    await waitFor(() =>
      expect(window.api.agent.testProviderConnection).toHaveBeenCalledWith({
        agentId: "gemini",
        profileId: "profile-1",
      }),
    );
    await act(async () => {
      finishConnection?.(successfulResult);
    });
    expect(await screen.findByText("Connection successful")).toBeVisible();
    expect(screen.getByText("2 models available")).toBeVisible();
    expect(screen.getByText("10 ms")).toBeVisible();
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument();

    window.api.agent.testProviderConnection = vi.fn().mockResolvedValue({
      platformId: "gemini",
      profileId: "profile-1",
      protocol: "google-generative-language",
      endpointOrigin: "https://generativelanguage.googleapis.com",
      model: "gemini-2.5-pro",
      status: "auth-error",
      startedAt: 30,
      finishedAt: 35,
      totalMs: 5,
      retryCount: 0,
      modelCount: null,
      modelAvailable: null,
      errorCode: "http-401",
    });
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByText("Authentication failed")).toBeVisible();
    expect(screen.getByText("5 ms")).toBeVisible();
    expect(screen.queryByText("2 models available")).not.toBeInTheDocument();
  });

  it("requires quota confirmation before an explicit streaming model test", async () => {
    const codexProfile = profile({
      platformId: "codex",
      name: "Codex work",
      providerKind: "openai-compatible",
      protocol: "openai-responses",
      endpoint: "https://gateway.example.com/v1",
      config: { providerId: "work-gateway" },
      secretState: "available",
    });
    window.api.agent.listProviderProfiles = vi
      .fn()
      .mockResolvedValue([codexProfile]);
    window.api.agent.previewProviderMigration = vi.fn().mockResolvedValue({
      agentId: "codex",
      nativeDigest: "empty",
      candidates: [],
    });
    window.api.agent.testProviderModel = vi.fn().mockResolvedValue({
      platformId: "codex",
      profileId: "profile-1",
      protocol: "responses",
      endpointOrigin: "https://gateway.example.com",
      model: "claude-sonnet-4",
      status: "ok",
      startedAt: 10,
      finishedAt: 40,
      totalMs: 30,
      firstTokenMs: 12,
      retryCount: 0,
      inputTokens: 8,
      outputTokens: 1,
      outputPreview: "OK",
    });

    await renderWorkbench(createAgent("codex"));
    fireEvent.click(screen.getByRole("button", { name: "Test model" }));

    const confirmation = await screen.findByRole("alertdialog", {
      name: "Run model test?",
    });
    expect(
      within(confirmation).getByText(/may consume provider quota/i),
    ).toBeVisible();
    expect(window.api.agent.testProviderModel).not.toHaveBeenCalled();
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Run test" }),
    );

    expect(await screen.findByText("Model responded")).toBeVisible();
    expect(screen.getByText("12 ms to first token")).toBeVisible();
    expect(screen.getByText("OK")).toBeVisible();
    expect(window.api.agent.testProviderModel).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "codex",
        profileId: "profile-1",
        requestId: expect.stringMatching(/^model-test-/),
      }),
    );
    expect(screen.queryByText(/secret/i)).not.toBeInTheDocument();
  });

  it("requires an explicit per-field conflict choice before activation", async () => {
    window.api.agent.listProviderProfiles = vi
      .fn()
      .mockResolvedValue([profile()]);
    window.api.agent.previewProviderActivation = vi
      .fn()
      .mockResolvedValue(activationPlan());
    window.api.agent.activateProvider = vi.fn().mockResolvedValue({
      status: "verified",
      plan: activationPlan({
        status: "apply",
        canApply: true,
        requiresReview: false,
        decisions: [
          {
            field: "model",
            status: "apply",
            current: "claude-opus-4",
            desired: "claude-sonnet-4",
          },
        ],
      }),
      verification: {
        verified: true,
        nativeDigest: "digest-after",
        state: {
          platformId: "claude",
          adapterVersion: "model-profile-v1",
          nativeDigest: "digest-after",
          values: { model: "claude-sonnet-4" },
        },
      },
      rollback: null,
    });

    await renderWorkbench();
    expect(
      screen.queryByRole("button", { name: "Activate" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("switch", {
        name: "Activate Claude production",
      }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Review provider activation",
    });
    const activate = within(dialog).getByRole("button", {
      name: "Activate provider",
    });
    expect(activate).toBeDisabled();
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "Keep current value" }),
    );
    expect(activate).toBeDisabled();
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "Use provider value" }),
    );
    expect(activate).toBeEnabled();
    fireEvent.click(activate);

    await waitFor(() =>
      expect(window.api.agent.activateProvider).toHaveBeenCalledWith({
        agentId: "claude",
        profileId: "profile-1",
        expectedCurrentDigest: "digest-current",
        resolutions: [{ field: "model", action: "use-profile" }],
      }),
    );
    expect(
      await within(dialog).findByText("Activation verified"),
    ).toBeVisible();
  });

  it("keeps rollback diagnostics visible after verification failure", async () => {
    window.api.agent.listProviderProfiles = vi
      .fn()
      .mockResolvedValue([profile()]);
    window.api.agent.previewProviderActivation = vi.fn().mockResolvedValue(
      activationPlan({
        status: "apply",
        canApply: true,
        requiresReview: false,
        decisions: [
          {
            field: "model",
            status: "apply",
            current: "claude-opus-4",
            desired: "claude-sonnet-4",
          },
        ],
      }),
    );
    window.api.agent.activateProvider = vi.fn().mockResolvedValue({
      status: "rolled-back",
      plan: activationPlan({
        status: "apply",
        canApply: true,
        requiresReview: false,
      }),
      verification: {
        verified: false,
        nativeDigest: "digest-wrong",
        state: {
          platformId: "claude",
          adapterVersion: "model-profile-v1",
          nativeDigest: "digest-wrong",
          values: { model: "wrong" },
        },
        errorCode: "provider-state-mismatch",
      },
      rollback: {
        restored: true,
        nativeDigest: "digest-current",
      },
      errorCode: "provider-state-mismatch",
    });

    await renderWorkbench();
    fireEvent.click(
      await screen.findByRole("switch", {
        name: "Activate Claude production",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Review provider activation",
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Activate provider" }),
    );

    expect(
      await within(dialog).findByText(
        "Activation failed; previous state restored",
      ),
    ).toBeVisible();
    expect(within(dialog).getByText("provider-state-mismatch")).toBeVisible();
  });

  it("keeps blocked activation and rollback failure diagnostics bounded in the dialog", async () => {
    const blockedPlan = activationPlan({
      status: "blocked",
      canApply: false,
      requiresReview: false,
      blockedReasons: ["profile-secret-missing"],
      decisions: [
        {
          field: "endpoint",
          status: "blocked",
          current: null,
          desired: "https://api.example.com",
        },
      ],
    });

    await renderWorkbench();
    act(() => {
      useAgentProviderStore.setState({
        activationPlan: blockedPlan,
        activationResult: null,
        errorCode: "AGENT_PROVIDER_OPERATION_FAILED",
      });
    });

    const dialog = await screen.findByRole("dialog", {
      name: "Review provider activation",
    });
    expect(within(dialog).getByText("Activation is blocked")).toBeVisible();
    expect(within(dialog).getByText("profile-secret-missing")).toBeVisible();
    expect(within(dialog).getByText("Provider operation failed")).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Activate provider" }),
    ).toBeDisabled();

    act(() => {
      useAgentProviderStore.setState({
        activationResult: {
          status: "failed",
          plan: blockedPlan,
          verification: null,
          rollback: {
            restored: false,
            nativeDigest: null,
            errorCode: "rollback-not-verified",
          },
        },
        errorCode: null,
      });
    });
    expect(
      await within(dialog).findByText(
        "Activation failed; rollback could not be verified",
      ),
    ).toBeVisible();
    fireEvent.click(within(dialog).getByText("Close"));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: "Review provider activation",
        }),
      ).not.toBeInTheDocument(),
    );
  });

  it("creates a Claude API profile with an explicit credential kind and no exposed secret reference", async () => {
    const created = profile({
      id: "profile-created",
      name: "Work",
      protocol: "anthropic-messages",
      config: { credentialEnvKey: "ANTHROPIC_API_KEY" },
    });
    window.api.agent.createProviderProfile = vi.fn().mockResolvedValue(created);

    await renderWorkbench();
    fireEvent.click(
      screen.getByRole("button", { name: "Add custom provider" }),
    );
    const dialog = await screen.findByRole("region", {
      name: "Add provider",
    });
    expect(dialog.querySelector("select")).toBeNull();
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: " Work " },
    });
    fireEvent.change(within(dialog).getByLabelText("Provider kind"), {
      target: { value: "anthropic" },
    });
    fireEvent.change(within(dialog).getByLabelText("Primary model"), {
      target: { value: "claude-sonnet-4" },
    });
    fireEvent.change(within(dialog).getByLabelText("Credential (write-only)"), {
      target: { value: "new-secret" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save provider" }),
    );

    await waitFor(() =>
      expect(window.api.agent.createProviderProfile).toHaveBeenCalledWith({
        profile: {
          platformId: "claude",
          name: "Work",
          providerKind: "anthropic",
          protocol: "anthropic-messages",
          endpoint: null,
          config: { credentialEnvKey: "ANTHROPIC_API_KEY" },
          source: "manual",
        },
        modelMappings: [
          {
            routeKey: "primary",
            modelId: "claude-sonnet-4",
            parameters: {},
          },
        ],
        secret: "new-secret",
      }),
    );
    expect(
      vi.mocked(window.api.agent.createProviderProfile).mock.calls[0]?.[0],
    ).not.toHaveProperty("profile.secretRef");
  });

  it("creates a Gemini paid API profile with the verified protocol and credential contract", async () => {
    window.api.agent.listProviderProfiles = vi.fn().mockResolvedValue([]);
    window.api.agent.createProviderProfile = vi.fn().mockResolvedValue(
      profile({
        id: "profile-gemini",
        platformId: "gemini",
        name: "Gemini work",
        providerKind: "google-gemini",
        protocol: "google-generative-ai",
        config: { credentialEnvKey: "GEMINI_API_KEY" },
      }),
    );

    await renderWorkbench(createAgent("gemini"));
    fireEvent.click(
      screen.getByRole("button", { name: "Add custom provider" }),
    );
    const dialog = await screen.findByRole("region", {
      name: "Add provider",
    });
    expect(within(dialog).getByLabelText("Provider kind")).toHaveValue(
      "google-gemini",
    );
    expect(within(dialog).getByLabelText("Protocol")).toHaveTextContent(
      "Google Generative AI",
    );
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: " Gemini work " },
    });
    fireEvent.change(within(dialog).getByLabelText("Primary model"), {
      target: { value: " gemini-2.5-pro " },
    });
    fireEvent.change(within(dialog).getByLabelText("Endpoint (optional)"), {
      target: {
        value: " https://generativelanguage.googleapis.com ",
      },
    });
    fireEvent.change(within(dialog).getByLabelText("Credential (write-only)"), {
      target: { value: "gemini-secret" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save provider" }),
    );

    await waitFor(() =>
      expect(window.api.agent.createProviderProfile).toHaveBeenCalledWith({
        profile: {
          platformId: "gemini",
          name: "Gemini work",
          providerKind: "google-gemini",
          protocol: "google-generative-ai",
          endpoint: "https://generativelanguage.googleapis.com",
          config: { credentialEnvKey: "GEMINI_API_KEY" },
          source: "manual",
        },
        modelMappings: [
          {
            routeKey: "primary",
            modelId: "gemini-2.5-pro",
            parameters: {},
          },
        ],
        secret: "gemini-secret",
      }),
    );
  });

  it("clears a managed Gemini secret and records the native auth type when switching auth modes", async () => {
    const existing = profile({
      platformId: "gemini",
      providerKind: "google-gemini",
      protocol: "google-generative-ai",
      config: { credentialEnvKey: "GEMINI_API_KEY" },
      secretState: "available",
    });
    window.api.agent.listProviderProfiles = vi
      .fn()
      .mockResolvedValue([existing]);
    window.api.agent.updateProviderProfile = vi.fn().mockResolvedValue({
      ...existing,
      providerKind: "vertex-ai",
      protocol: "platform-native",
      config: { nativeAuthType: "vertex-ai" },
      secretState: "none",
    });

    await renderWorkbench(createAgent("gemini"));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("region", {
      name: "Edit provider",
    });
    fireEvent.change(within(dialog).getByLabelText("Provider kind"), {
      target: { value: "vertex-ai" },
    });
    chooseProviderFormOption(dialog, "Protocol", "Platform native");
    expect(
      within(dialog).queryByLabelText("Credential (write-only)"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save provider" }),
    );

    await waitFor(() =>
      expect(window.api.agent.updateProviderProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          profile: expect.objectContaining({
            providerKind: "vertex-ai",
            protocol: "platform-native",
            config: { nativeAuthType: "vertex-ai" },
          }),
          secretAction: "clear",
        }),
      ),
    );
  });

  it("creates a Kimi direct provider with native provider and model metadata", async () => {
    window.api.agent.listProviderProfiles = vi.fn().mockResolvedValue([]);
    window.api.agent.createProviderProfile = vi.fn().mockResolvedValue(
      profile({
        id: "profile-kimi",
        platformId: "kimi",
        name: "Kimi work",
        providerKind: "kimi",
        protocol: "openai-chat",
        config: { providerId: "work-kimi" },
      }),
    );

    await renderWorkbench(createAgent("kimi"));
    fireEvent.click(
      screen.getByRole("button", { name: "Add custom provider" }),
    );
    const dialog = await screen.findByRole("region", {
      name: "Add provider",
    });
    expect(within(dialog).getByLabelText("Provider kind")).toHaveTextContent(
      "Kimi",
    );
    expect(within(dialog).getByLabelText("Protocol")).toHaveTextContent(
      "OpenAI Chat",
    );
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: " Kimi work " },
    });
    fireEvent.change(within(dialog).getByLabelText("Provider ID"), {
      target: { value: " work-kimi " },
    });
    fireEvent.change(within(dialog).getByLabelText("Primary model"), {
      target: { value: " work/kimi-k2 " },
    });
    fireEvent.change(within(dialog).getByLabelText("Upstream model"), {
      target: { value: " kimi-k2 " },
    });
    fireEvent.change(within(dialog).getByLabelText("Maximum context size"), {
      target: { value: "131072" },
    });
    fireEvent.change(within(dialog).getByLabelText("Endpoint (optional)"), {
      target: { value: " https://api.moonshot.ai/v1 " },
    });
    fireEvent.change(within(dialog).getByLabelText("Credential (write-only)"), {
      target: { value: "kimi-secret" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save provider" }),
    );

    await waitFor(() =>
      expect(window.api.agent.createProviderProfile).toHaveBeenCalledWith({
        profile: {
          platformId: "kimi",
          name: "Kimi work",
          providerKind: "kimi",
          protocol: "openai-chat",
          endpoint: "https://api.moonshot.ai/v1",
          config: { providerId: "work-kimi" },
          source: "manual",
        },
        modelMappings: [
          {
            routeKey: "primary",
            modelId: "work/kimi-k2",
            parameters: {
              upstreamModelId: "kimi-k2",
              maxContextSize: 131_072,
            },
          },
        ],
        secret: "kimi-secret",
      }),
    );
  });

  it("keeps Google Generative AI selectable for Kimi's google-genai provider", async () => {
    window.api.agent.listProviderProfiles = vi.fn().mockResolvedValue([]);

    await renderWorkbench(createAgent("kimi"));
    fireEvent.click(
      screen.getByRole("button", { name: "Add custom provider" }),
    );
    const dialog = await screen.findByRole("region", {
      name: "Add provider",
    });

    chooseProviderFormOption(dialog, "Provider kind", "Google Generative AI");

    const protocol = within(dialog).getByLabelText("Protocol");
    expect(protocol).toHaveTextContent("Google Generative AI");
    fireEvent.click(protocol);
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual([
      "Platform native",
      "OpenAI Chat",
      "OpenAI Responses",
      "Anthropic Messages",
      "Google Generative AI",
    ]);
    expect(
      screen.getByRole("option", { name: "Google Generative AI" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("creates a Qwen v4 direct provider with an explicit provider and environment key", async () => {
    window.api.agent.listProviderProfiles = vi.fn().mockResolvedValue([]);
    window.api.agent.createProviderProfile = vi.fn().mockResolvedValue(
      profile({
        id: "profile-qwen",
        platformId: "qwen",
        name: "Qwen work",
        providerKind: "openai",
        protocol: "openai-chat",
        config: {
          providerId: "team-dashscope",
          envKey: "DASHSCOPE_API_KEY",
        },
      }),
    );

    await renderWorkbench(createAgent("qwen"));
    fireEvent.click(
      screen.getByRole("button", { name: "Add custom provider" }),
    );
    const dialog = await screen.findByRole("region", {
      name: "Add provider",
    });
    expect(within(dialog).getByLabelText("Provider kind")).toHaveTextContent(
      "OpenAI",
    );
    expect(within(dialog).getByLabelText("Protocol")).toHaveTextContent(
      "OpenAI Chat",
    );
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: " Qwen work " },
    });
    fireEvent.change(within(dialog).getByLabelText("Provider ID"), {
      target: { value: " team-dashscope " },
    });
    fireEvent.change(within(dialog).getByLabelText("Environment variable"), {
      target: { value: " DASHSCOPE_API_KEY " },
    });
    fireEvent.change(within(dialog).getByLabelText("Primary model"), {
      target: { value: " qwen3.6-plus " },
    });
    fireEvent.change(within(dialog).getByLabelText("Endpoint"), {
      target: {
        value: " https://dashscope.aliyuncs.com/compatible-mode/v1 ",
      },
    });
    fireEvent.change(within(dialog).getByLabelText("Credential (write-only)"), {
      target: { value: "qwen-secret" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save provider" }),
    );

    await waitFor(() =>
      expect(window.api.agent.createProviderProfile).toHaveBeenCalledWith({
        profile: {
          platformId: "qwen",
          name: "Qwen work",
          providerKind: "openai",
          protocol: "openai-chat",
          endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          config: {
            providerId: "team-dashscope",
            envKey: "DASHSCOPE_API_KEY",
          },
          source: "manual",
        },
        modelMappings: [
          {
            routeKey: "primary",
            modelId: "qwen3.6-plus",
            parameters: {},
          },
        ],
        secret: "qwen-secret",
      }),
    );
  });

  it("validates required fields before creating a profile", async () => {
    window.api.agent.createProviderProfile = vi.fn();

    await renderWorkbench();
    fireEvent.click(
      screen.getByRole("button", { name: "Add custom provider" }),
    );
    const dialog = await screen.findByRole("region", {
      name: "Add provider",
    });
    fireEvent.change(within(dialog).getByLabelText("Provider kind"), {
      target: { value: " " },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save provider" }),
    );

    expect(within(dialog).getAllByText("This field is required.")).toHaveLength(
      3,
    );
    expect(window.api.agent.createProviderProfile).not.toHaveBeenCalled();
  });

  it("preserves imported config while editing profile fields and replacing the credential", async () => {
    const existing = profile({
      protocol: "anthropic-messages",
      endpoint: "https://old.example/v1",
      config: {
        region: "us-east-1",
        imported: true,
        credentialEnvKey: "ANTHROPIC_AUTH_TOKEN",
      },
      secretState: "available",
      modelMappings: [
        {
          id: "mapping-primary",
          providerProfileId: "profile-1",
          routeKey: "primary",
          modelId: "claude-sonnet-4",
          parameters: {},
        },
        {
          id: "mapping-secondary",
          providerProfileId: "profile-1",
          routeKey: "secondary",
          modelId: "claude-haiku-4",
          parameters: {},
        },
      ],
    });
    window.api.agent.listProviderProfiles = vi
      .fn()
      .mockResolvedValue([existing]);
    window.api.agent.updateProviderProfile = vi
      .fn()
      .mockResolvedValue({ ...existing, name: "Edited profile", updatedAt: 3 });

    await renderWorkbench();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("region", {
      name: "Edit provider",
    });
    expect(
      within(dialog).queryByLabelText("Secondary model (optional)"),
    ).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: " Edited profile " },
    });
    expect(within(dialog).getByLabelText("Credential type")).toHaveTextContent(
      "Auth token (ANTHROPIC_AUTH_TOKEN)",
    );
    fireEvent.change(within(dialog).getByLabelText("Endpoint (optional)"), {
      target: { value: " https://new.example/v1 " },
    });
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "Replace credential" }),
    );
    fireEvent.change(within(dialog).getByLabelText("Credential (write-only)"), {
      target: { value: "replacement-secret" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save provider" }),
    );

    await waitFor(() =>
      expect(window.api.agent.updateProviderProfile).toHaveBeenCalledWith({
        id: "profile-1",
        expectedUpdatedAt: 2,
        profile: {
          name: "Edited profile",
          providerKind: "anthropic",
          protocol: "anthropic-messages",
          endpoint: "https://new.example/v1",
          config: {
            region: "us-east-1",
            imported: true,
            credentialEnvKey: "ANTHROPIC_AUTH_TOKEN",
          },
        },
        modelMappings: [
          {
            routeKey: "primary",
            modelId: "claude-sonnet-4",
            parameters: {},
          },
        ],
        secretAction: "replace",
        secret: "replacement-secret",
      }),
    );
  });

  it("removes a managed Claude credential when switching to platform-native auth", async () => {
    const existing = profile({
      protocol: "anthropic-messages",
      config: { credentialEnvKey: "ANTHROPIC_API_KEY" },
      secretState: "available",
    });
    window.api.agent.listProviderProfiles = vi
      .fn()
      .mockResolvedValue([existing]);
    window.api.agent.updateProviderProfile = vi.fn().mockResolvedValue({
      ...existing,
      protocol: "platform-native",
      config: {},
      secretState: "none",
      updatedAt: 3,
    });

    await renderWorkbench();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("region", {
      name: "Edit provider",
    });
    chooseProviderFormOption(dialog, "Protocol", "Platform native");
    expect(
      within(dialog).queryByLabelText("Credential (write-only)"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save provider" }),
    );

    await waitFor(() =>
      expect(window.api.agent.updateProviderProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          profile: expect.objectContaining({
            protocol: "platform-native",
            config: {},
          }),
          secretAction: "clear",
        }),
      ),
    );
    expect(
      vi.mocked(window.api.agent.updateProviderProfile).mock.calls[0]?.[0],
    ).not.toHaveProperty("secret");
  });

  it("supports explicit credential clearing without returning the existing secret", async () => {
    const existing = profile({
      protocol: "anthropic-messages",
      config: { credentialEnvKey: "ANTHROPIC_API_KEY" },
      secretState: "missing",
    });
    window.api.agent.listProviderProfiles = vi
      .fn()
      .mockResolvedValue([existing]);
    window.api.agent.updateProviderProfile = vi
      .fn()
      .mockResolvedValue({ ...existing, secretState: "none", updatedAt: 3 });

    await renderWorkbench();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("region", {
      name: "Edit provider",
    });
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "Replace credential" }),
    );
    const credential = within(dialog).getByLabelText("Credential (write-only)");
    fireEvent.change(credential, { target: { value: "discard-me" } });
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "Remove credential" }),
    );
    expect(
      within(dialog).queryByLabelText("Credential (write-only)"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save provider" }),
    );

    await waitFor(() =>
      expect(window.api.agent.updateProviderProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "profile-1",
          secretAction: "clear",
        }),
      ),
    );
    expect(
      vi.mocked(window.api.agent.updateProviderProfile).mock.calls[0]?.[0],
    ).not.toHaveProperty("secret");
  });

  it("preserves an absent credential and keeps the dialog open after a failed update", async () => {
    const existing = profile({ secretState: "none" });
    window.api.agent.listProviderProfiles = vi
      .fn()
      .mockResolvedValue([existing]);
    window.api.agent.updateProviderProfile = vi
      .fn()
      .mockRejectedValue(
        new Error("native details that must not reach the renderer"),
      );

    await renderWorkbench();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("region", {
      name: "Edit provider",
    });
    expect(
      within(dialog).queryByLabelText("Credential (write-only)"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save provider" }),
    );

    await waitFor(() =>
      expect(window.api.agent.updateProviderProfile).toHaveBeenCalledWith(
        expect.objectContaining({ secretAction: "preserve" }),
      ),
    );
    expect(
      await screen.findByRole("region", { name: "Edit provider" }),
    ).toBeVisible();
    expect(screen.getByText("Provider operation failed")).toBeVisible();
  });
});
