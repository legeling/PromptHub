import { useCallback, useLayoutEffect, useRef, type ReactElement } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  BotIcon,
  BookOpenIcon,
  BoxIcon,
  CommandIcon,
  GripVerticalIcon,
  PackageIcon,
  ServerIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  useSettingsStore,
  type DesktopHomeModule,
} from "../../../stores/settings.store";
import { normalizeDesktopHomeModuleOrder } from "../../../stores/settings/settings-normalizers";
import { ToggleSwitch } from "../shared";
import { AppearanceSection } from "./AppearanceSection";

const modules = {
  prompt: { label: "common.prompts", icon: CommandIcon },
  agents: { label: "agents.title", icon: BotIcon },
  skill: { label: "common.skills", icon: BoxIcon },
  mcp: { label: "mcp.title", icon: ServerIcon },
  plugin: { label: "plugin.title", icon: PackageIcon },
  rules: { label: "rules.title", icon: BookOpenIcon },
};

function ModuleRow({
  id,
  enabled,
  lastEnabled,
  onToggle,
}: {
  id: DesktopHomeModule;
  enabled: boolean;
  lastEnabled: boolean;
  onToggle: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !enabled });
  const element = useRef<HTMLDivElement | null>(null);
  const setElementRef = useCallback(
    (node: HTMLDivElement | null) => {
      element.current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );
  // DnD supplies per-frame transforms; keep them out of declarative layout styles.
  useLayoutEffect(() => {
    if (!element.current) return;
    element.current.style.transform = CSS.Transform.toString(transform) ?? "";
    element.current.style.transition = transition ?? "";
  }, [transform, transition]);
  const { icon: Icon, label: labelKey } = modules[id];
  const label = t(labelKey);
  return (
    <div
      ref={setElementRef}
      className={`relative flex items-center gap-3 bg-card px-4 py-3 ${isDragging ? "z-10 opacity-70" : ""}`}
    >
      <button
        type="button"
        aria-label={t("settings.appearanceDesign.reorderModule", {
          module: label,
        })}
        disabled={!enabled}
        className="cursor-grab rounded-md p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-default disabled:opacity-25"
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon aria-hidden="true" className="h-4 w-4" />
      </button>
      <Icon
        aria-hidden="true"
        className="h-5 w-5 shrink-0 text-muted-foreground"
      />
      <span className="min-w-0 flex-1 text-sm">{label}</span>
      <ToggleSwitch
        checked={enabled}
        disabled={lastEnabled}
        onChange={onToggle}
        ariaLabel={label}
      />
    </div>
  );
}

export function WorkspaceSettings(): ReactElement {
  const { t } = useTranslation();
  const {
    desktopHomeModules: enabled,
    desktopHomeModuleOrder,
    reorderDesktopHomeModules,
    toggleDesktopHomeModule,
  } = useSettingsStore();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const allModules = normalizeDesktopHomeModuleOrder(
    desktopHomeModuleOrder,
    enabled,
  );
  const handleDragEnd = ({ active, over }: DragEndEvent): void => {
    if (!over || active.id === over.id) return;
    const from = enabled.findIndex((id) => id === active.id);
    const to = enabled.findIndex((id) => id === over.id);
    if (from >= 0 && to >= 0)
      reorderDesktopHomeModules(arrayMove(enabled, from, to));
  };
  return (
    <AppearanceSection title={t("settings.desktopWorkspace")}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={enabled} strategy={verticalListSortingStrategy}>
          <div className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border">
            {allModules.map((id) => (
              <ModuleRow
                key={id}
                id={id}
                enabled={enabled.includes(id)}
                lastEnabled={enabled.includes(id) && enabled.length === 1}
                onToggle={() => toggleDesktopHomeModule(id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </AppearanceSection>
  );
}
