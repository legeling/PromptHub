import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentAppearanceOverview } from "@prompthub/shared/types";
import { AgentPetWorkspace } from "../../../src/renderer/components/agent/AgentPetWorkspace";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

vi.mock(
  "../../../src/renderer/components/agent/AgentAppearancePreview",
  () => ({
    AgentAppearancePreview: ({
      alt,
      className,
    }: {
      alt: string;
      className?: string;
    }) => <div aria-label={alt} className={className} />,
  }),
);

const overview: AgentAppearanceOverview = {
  agentId: "codex",
  supported: true,
  engineVersion: "1.2.0",
  adapterLastVerifiedVersion: "1.2.0",
  activeThemeId: null,
  themeDirectoryPath: "/Users/test/.codex/themes",
  petDirectoryPath: "/Users/test/.codex/pets",
  themes: [],
  pets: [
    {
      id: "code-nono",
      name: "CodeNoNo",
      description: "A compact coding companion.",
      directoryPath: "/Users/test/.codex/pets/code-nono",
      spriteVersionNumber: 2,
      spritesheetName: "spritesheet.png",
      spritesheetBytes: 1_600_000,
    },
  ],
  invalidThemeCount: 0,
  invalidPetCount: 0,
};

function renderWorkspace(
  overrides: Partial<Parameters<typeof AgentPetWorkspace>[0]> = {},
) {
  return renderWithI18n(
    <AgentPetWorkspace
      agentId="codex"
      overview={overview}
      busy={false}
      error={null}
      onImport={vi.fn()}
      onUpdate={vi.fn().mockResolvedValue(true)}
      onInstall={vi.fn().mockResolvedValue(true)}
      onExport={vi.fn()}
      onDelete={vi.fn()}
      {...overrides}
    />,
    { language: "zh" },
  );
}

describe("AgentPetWorkspace", () => {
  it("explains a timed out catalog request and lets refresh recover", async () => {
    vi.mocked(window.api.agent.listAppearancePetStore).mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'agent:appearance:pet-store:list': Error: PET_STORE_REQUEST_TIMEOUT: Official Pet request timed out after 10000ms",
      ),
    );
    await renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Awesome Codex Pet" }));
    expect(
      await screen.findByText(/请求超时，请检查网络设置中的代理后刷新重试/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Error invoking remote method/),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    expect(await screen.findByText("商店宠物")).toBeInTheDocument();
    expect(screen.queryByText(/请求超时/)).not.toBeInTheDocument();
  });

  beforeEach(() => {
    installWindowMocks({
      api: {
        agent: {
          getAgentPetPreview: vi
            .fn()
            .mockResolvedValue("data:image/png;base64,pet"),
          listAppearancePetStore: vi.fn().mockResolvedValue({
            items: [
              {
                id: "store-pet",
                name: "Store Pet",
                localizedName: "商店宠物",
                author: "PromptHub",
                authorHandle: "prompthub",
                category: "robot",
                license: "MIT",
                description:
                  "Official catalog pet with a deliberately long description that must stay inside the shared asset card without pushing its actions or metadata outside the card boundary.",
                spriteVersionNumber: 1,
                installed: false,
              },
            ],
            total: 1,
            page: 1,
            pageSize: 12,
            hasMore: false,
          }),
          getAppearancePetStorePreview: vi
            .fn()
            .mockResolvedValue("data:image/webp;base64,store"),
        },
      },
    });
  });

  it("makes the pet preview primary, hides its path, and opens the exact directory", async () => {
    await renderWorkspace();

    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByTestId("installed-pet-card")).toHaveClass("p-4");
    expect(screen.getByTestId("installed-pet-preview")).toHaveClass(
      "h-28",
      "w-28",
    );
    expect(
      screen.queryByText("/Users/test/.codex/pets/code-nono"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("打开 CodeNoNo 所在目录"));

    expect(window.electron.openPath).toHaveBeenCalledWith(
      "/Users/test/.codex/pets/code-nono",
    );
  });

  it("edits pet metadata without changing its filesystem identity", async () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    await renderWorkspace({ onUpdate });

    fireEvent.click(
      within(screen.getByTestId("installed-pet-card-actions")).getByRole(
        "button",
        { name: "编辑 CodeNoNo" },
      ),
    );
    fireEvent.change(screen.getByLabelText("名称"), {
      target: { value: "Code Friend" },
    });
    fireEvent.change(screen.getByLabelText("描述"), {
      target: { value: "Updated description" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith({
        agentId: "codex",
        petId: "code-nono",
        name: "Code Friend",
        description: "Updated description",
      }),
    );
  });

  it("loads the official catalog and installs the selected pet", async () => {
    const onInstall = vi.fn().mockResolvedValue(true);
    await renderWorkspace({ onInstall });

    fireEvent.click(screen.getByRole("button", { name: "Awesome Codex Pet" }));
    expect(await screen.findByText("商店宠物")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "商店宠物" })).toHaveAttribute(
        "src",
        "data:image/webp;base64,store",
      ),
    );
    expect(screen.getByTestId("store-pet-card")).toHaveClass("p-4");
    expect(screen.getByTestId("store-pet-preview")).toHaveClass("h-28", "w-28");
    expect(screen.getByTestId("store-pet-preview-description")).toHaveClass(
      "line-clamp-2",
      "break-words",
      "overflow-hidden",
    );
    expect(screen.queryByText("store-pet")).not.toBeInTheDocument();
    fireEvent.click(
      within(screen.getByTestId("store-pet-card-actions")).getByRole("button", {
        name: "安装 Pet",
      }),
    );

    await waitFor(() => expect(onInstall).toHaveBeenCalledWith("store-pet"));
    await waitFor(() =>
      expect(window.api.agent.listAppearancePetStore).toHaveBeenCalledTimes(2),
    );
    expect(window.api.agent.getAppearancePetStorePreview).toHaveBeenCalledTimes(
      1,
    );
  });

  it("submits catalog searches only by action or Enter", async () => {
    const listStore = vi.fn().mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 12,
      hasMore: false,
    });
    window.api.agent.listAppearancePetStore = listStore;
    await renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Awesome Codex Pet" }));
    await waitFor(() => expect(listStore).toHaveBeenCalledTimes(1));

    const searchInput = screen.getByPlaceholderText("搜索 Pet、作者或分类...");
    fireEvent.change(searchInput, { target: { value: "isaac" } });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 240));
    });
    expect(listStore).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "搜索 Pet" }));
    await waitFor(() => expect(listStore).toHaveBeenCalledTimes(2));
    expect(listStore).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "isaac", page: 1 }),
    );

    fireEvent.change(searchInput, { target: { value: "cyrene" } });
    fireEvent.keyDown(searchInput, { key: "Enter", code: "Enter" });
    await waitFor(() => expect(listStore).toHaveBeenCalledTimes(3));
    expect(listStore).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "cyrene", page: 1 }),
    );
  });

  it("keeps the newest catalog result when an older search finishes last", async () => {
    let resolveFirst!: (value: unknown) => void;
    let resolveSecond!: (value: unknown) => void;
    const listStore = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveFirst = resolve)),
      )
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveSecond = resolve)),
      );
    window.api.agent.listAppearancePetStore = listStore;
    await renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Awesome Codex Pet" }));
    await waitFor(() => expect(listStore).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByPlaceholderText("搜索 Pet、作者或分类..."), {
      target: { value: "new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "搜索 Pet" }));
    await waitFor(() => expect(listStore).toHaveBeenCalledTimes(2));

    await act(async () => {
      resolveSecond({
        items: [
          {
            id: "new-pet",
            name: "New Pet",
            localizedName: "新宠物",
            author: "PromptHub",
            authorHandle: "prompthub",
            category: "robot",
            license: "MIT",
            description: "Newest result",
            spriteVersionNumber: 2,
            installed: false,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 12,
        hasMore: false,
      });
    });
    expect(await screen.findByText("新宠物")).toBeInTheDocument();

    await act(async () => {
      resolveFirst({
        items: [
          {
            id: "old-pet",
            name: "Old Pet",
            localizedName: "旧宠物",
            author: "PromptHub",
            authorHandle: "prompthub",
            category: "robot",
            license: "MIT",
            description: "Stale result",
            spriteVersionNumber: 1,
            installed: false,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 12,
        hasMore: false,
      });
    });
    expect(screen.getByText("新宠物")).toBeInTheDocument();
    expect(screen.queryByText("旧宠物")).not.toBeInTheDocument();
  });
});
