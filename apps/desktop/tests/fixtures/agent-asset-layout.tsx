import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";

import {
  AgentAssetCard,
  AgentAssetCardContent,
  AgentAssetManagementSurface,
  AgentAssetPrimaryAction,
} from "../../src/renderer/components/agent/AgentAssetManagementSurface";

const sourcePath = `/fixture/plugins/cache/${"long-package-name/".repeat(15)}entry`;
// The standalone Node fixture uses classic JSX; Vite supplies the JSX runtime in the app.
Object.assign(globalThis, { React });
const tags = [
  "Codex",
  "1 Skill",
  "1 Hook",
  "7 resources",
  "23 files",
  "unbroken".repeat(40),
];

function AssetFixture({ name }: { name: string }) {
  return (
    <AgentAssetCard
      testId="asset-card"
      actionsTestId="asset-actions"
      onOpen={() => {}}
      actions={<button>Inspect configuration</button>}
    >
      <AgentAssetCardContent
        icon={<span />}
        iconTestId="asset-icon"
        title={name}
        status={
          <span className="inline-flex items-center rounded-md px-1.5 text-[10px]">
            Managed in PromptHub
          </span>
        }
        description="A locally installed asset with a long package path and many inventory labels"
        source={sourcePath}
        metadata={tags.map((tag) => (
          <span key={tag} className="rounded-full border px-2 text-[11px]">
            {tag}
          </span>
        ))}
      />
    </AgentAssetCard>
  );
}

async function renderFixture(): Promise<string> {
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: {} });
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <AgentAssetManagementSurface
        domain="plugins"
        query=""
        onQueryChange={() => {}}
        searchLabel="Search assets"
        filters={[{ key: "all", label: "26 Plugins", testId: "filter-all" }]}
        activeFilter="all"
        onFilterChange={() => {}}
        refreshLabel="Refresh"
        onRefresh={() => {}}
        isRefreshing={false}
        primaryAction={<AgentAssetPrimaryAction label="Add Plugin" />}
        listTestId="asset-list"
        gridTestId="asset-grid"
        isLoading={false}
        loadingLabel="Loading"
        isEmpty={false}
        emptyState={null}
        page={{
          items: [],
          pageIndex: 0,
          pageCount: 1,
          start: 1,
          end: 2,
          total: 2,
          canPrevious: false,
          canNext: false,
          previous: () => {},
          next: () => {},
        }}
      >
        <AssetFixture name="Browser" />
        <AssetFixture name={"node_repl_".repeat(30)} />
      </AgentAssetManagementSurface>
    </I18nextProvider>,
  );
}

renderFixture().then((markup) => {
  process.stdout.write(markup);
});
