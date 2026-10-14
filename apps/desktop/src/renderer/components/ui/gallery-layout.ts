import type { CSSProperties } from "react";

// Match the compact card width already supported by explicit Skill/MCP columns.
export const AUTO_GALLERY_GRID_STYLE: CSSProperties = {
  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 240px), 1fr))",
};
