interface ShortcutReferenceGroup {
  title: string;
  entries: { label: string; keys: string[]; macKeys?: string[] }[];
}

// This is a read-only catalogue of existing context handlers, not a key registry.
// Keep each group aligned with the owning handlers named below.
export const SHORTCUT_REFERENCE: ShortcutReferenceGroup[] = [
  // App.tsx: search fallback and native fullscreen exit.
  {
    title: "general",
    entries: [
      { label: "focusSearch", keys: ["Mod + F"] },
      { label: "exitFullscreen", keys: ["Esc"] },
    ],
  },
  // TopBar / TopBarRulesSearch: only while the search field is focused.
  {
    title: "search",
    entries: [
      { label: "nextResult", keys: ["Tab"] },
      { label: "previousResult", keys: ["Shift + Tab"] },
      { label: "confirmResult", keys: ["Enter"] },
      { label: "clearSearch", keys: ["Esc"] },
    ],
  },
  // Create/EditPromptModal and usePromptDetailInlineEditor.
  {
    title: "prompt",
    entries: [
      { label: "savePrompt", keys: ["Mod + S", "Mod + Enter"] },
      { label: "editorFullscreen", keys: ["Mod + Shift + F"] },
      { label: "saveInline", keys: ["Mod + Enter"] },
      { label: "cancelInline", keys: ["Esc"] },
    ],
  },
  // EditSkillModal, SkillFileEditor and SkillCodeEditor's CodeMirror keymaps.
  {
    title: "skill",
    entries: [
      { label: "saveSkill", keys: ["Mod + S"] },
      { label: "indent", keys: ["Tab"] },
      { label: "outdent", keys: ["Shift + Tab"] },
      { label: "undo", keys: ["Mod + Z"] },
      { label: "redo", keys: ["Mod + Y"], macKeys: ["Mod + Shift + Z"] },
    ],
  },
  // ImagePreviewModal and useGenerationLightboxControls.
  {
    title: "image",
    entries: [
      { label: "previousImage", keys: ["←"] },
      { label: "nextImage", keys: ["→"] },
      { label: "closePreview", keys: ["Esc"] },
    ],
  },
];
