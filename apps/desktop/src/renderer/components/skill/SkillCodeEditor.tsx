import { useEffect, useMemo, useRef } from "react";
import {
  autocompletion,
  closeBrackets,
  completionKeymap,
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { yaml } from "@codemirror/lang-yaml";
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  HighlightStyle,
  indentOnInput,
  LanguageSupport,
  syntaxHighlighting,
} from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import {
  Annotation,
  Compartment,
  EditorState,
  Extension,
} from "@codemirror/state";
import { tags } from "@lezer/highlight";
import {
  crosshairCursor,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";

interface SkillCodeEditorProps {
  path: string;
  value: string;
  editable: boolean;
  onChange: (value: string) => void;
}

const editableCompartment = new Compartment();
const languageCompartment = new Compartment();
const parentValueSyncAnnotation = Annotation.define<boolean>();

const skillHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--skill-code-keyword)" },
  {
    tag: [tags.name, tags.variableName, tags.propertyName],
    color: "var(--skill-code-variable)",
  },
  { tag: [tags.function(tags.variableName), tags.labelName], color: "var(--skill-code-function)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--skill-code-string)" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "var(--skill-code-atom)" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "var(--skill-code-comment)", fontStyle: "italic" },
  { tag: tags.heading, color: "var(--skill-code-heading)", fontWeight: "700" },
  { tag: [tags.link, tags.url], color: "var(--skill-code-link)", textDecoration: "underline" },
  { tag: [tags.invalid, tags.deleted], color: "var(--skill-code-invalid)" },
  { tag: tags.inserted, color: "var(--skill-code-inserted)" },
]);

export function getSkillCodeEditorLanguage(path: string): Extension {
  const fileName = path.split("/").pop()?.toLowerCase() || "";
  const extension = fileName.includes(".") ? fileName.split(".").pop() : "";

  if (fileName === "dockerfile") {
    return [];
  }

  switch (extension) {
    case "css":
      return css();
    case "html":
    case "htm":
    case "xml":
      return html();
    case "js":
    case "jsx":
    case "mjs":
      return javascript({ jsx: extension === "jsx" });
    case "json":
      return json();
    case "md":
    case "mdx":
      return markdown();
    case "py":
      return python();
    case "sql":
      return sql();
    case "ts":
    case "tsx":
      return javascript({ jsx: extension === "tsx", typescript: true });
    case "yaml":
    case "yml":
      return yaml();
    default:
      return [];
  }
}

export function getSkillCodeEditorLanguageName(path: string): string {
  const fileName = path.split("/").pop()?.toLowerCase() || "";
  const extension = fileName.includes(".") ? fileName.split(".").pop() : "";
  if (fileName === "dockerfile") return "dockerfile";
  if (fileName === "package.json" || extension === "json") return "json";
  if (["md", "mdx"].includes(extension || "")) return "markdown";
  if (["ts", "tsx"].includes(extension || "")) return "typescript";
  if (["js", "jsx", "mjs"].includes(extension || "")) return "javascript";
  if (["yaml", "yml"].includes(extension || "")) return "yaml";
  if (extension === "py") return "python";
  if (extension === "html" || extension === "htm") return "html";
  if (extension === "css") return "css";
  if (extension === "sql") return "sql";
  return "plaintext";
}

function buildTheme() {
  return EditorView.theme({
    "&": {
      "--skill-code-keyword": "#7c3aed",
      "--skill-code-variable": "#1d4ed8",
      "--skill-code-function": "#0f766e",
      "--skill-code-string": "#15803d",
      "--skill-code-atom": "#b45309",
      "--skill-code-comment": "#64748b",
      "--skill-code-heading": "#334155",
      "--skill-code-link": "#2563eb",
      "--skill-code-invalid": "#dc2626",
      "--skill-code-inserted": "#16a34a",
      height: "100%",
      backgroundColor: "hsl(var(--background))",
      color: "hsl(var(--foreground))",
      fontSize: "0.8rem",
      overflow: "hidden",
    },
    ".dark &": {
      "--skill-code-keyword": "#d8b4fe",
      "--skill-code-variable": "#93c5fd",
      "--skill-code-function": "#5eead4",
      "--skill-code-string": "#86efac",
      "--skill-code-atom": "#fbbf24",
      "--skill-code-comment": "#94a3b8",
      "--skill-code-heading": "#e2e8f0",
      "--skill-code-link": "#7dd3fc",
      "--skill-code-invalid": "#fca5a5",
      "--skill-code-inserted": "#86efac",
    },
    ".cm-scroller": {
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      height: "100%",
      lineHeight: "1.625",
      overflow: "auto",
    },
    ".cm-content": {
      padding: "1rem 0",
    },
    ".cm-line": {
      padding: "0 1.25rem",
    },
    ".cm-gutters": {
      backgroundColor: "hsl(var(--muted) / 0.16)",
      color: "hsl(var(--muted-foreground))",
      borderRight: "1px solid hsl(var(--border))",
    },
    ".cm-activeLine": {
      backgroundColor: "hsl(var(--primary) / 0.06)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "hsl(var(--primary) / 0.08)",
      color: "hsl(var(--foreground))",
    },
    ".cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "hsl(var(--primary) / 0.2) !important",
    },
    ".cm-cursor": {
      borderLeftColor: "hsl(var(--foreground))",
    },
  });
}

function buildExtensions(
  path: string,
  editable: boolean,
  onChange: (value: string) => void,
): Extension[] {
  return [
    lineNumbers(),
    foldGutter(),
    history(),
    dropCursor(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    highlightSelectionMatches(),
    syntaxHighlighting(skillHighlightStyle),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    buildTheme(),
    EditorView.lineWrapping,
    languageCompartment.of(getSkillCodeEditorLanguage(path)),
    editableCompartment.of([
      EditorView.editable.of(editable),
      EditorState.readOnly.of(!editable),
    ]),
    EditorView.contentAttributes.of({
      "aria-label": editable ? "Code editor" : "Code viewer",
      role: "textbox",
      spellcheck: "false",
    }),
    EditorView.updateListener.of((update) => {
      const isParentValueSync = update.transactions.some((transaction) =>
        transaction.annotation(parentValueSyncAnnotation),
      );
      if (update.docChanged && !isParentValueSync) {
        onChange(update.state.doc.toString());
      }
    }),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),
  ];
}

export function SkillCodeEditor({
  path,
  value,
  editable,
  onChange,
}: SkillCodeEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  onChangeRef.current = onChange;

  const languageName = useMemo(
    () => getSkillCodeEditorLanguageName(path),
    [path],
  );

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: buildExtensions(path, editable, (nextValue) =>
          onChangeRef.current(nextValue),
        ),
      }),
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        languageCompartment.reconfigure(getSkillCodeEditorLanguage(path)),
        editableCompartment.reconfigure([
          EditorView.editable.of(editable),
          EditorState.readOnly.of(!editable),
        ]),
      ],
    });
    view.contentDOM.setAttribute(
      "aria-label",
      editable ? "Code editor" : "Code viewer",
    );
  }, [editable, path]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentValue = view.state.doc.toString();
    if (currentValue === value) return;
    view.dispatch({
      changes: { from: 0, to: currentValue.length, insert: value },
      annotations: parentValueSyncAnnotation.of(true),
    });
  }, [value]);

  return (
    <div
      ref={hostRef}
      data-testid="skill-code-editor"
      data-language={languageName}
      className="skill-code-editor"
    />
  );
}
