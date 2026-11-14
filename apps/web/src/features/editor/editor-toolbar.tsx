"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import {
  BoldIcon,
  CodeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  PilcrowIcon,
  QuoteIcon,
  Redo2Icon,
  SquareCodeIcon,
  StrikethroughIcon,
  UnderlineIcon,
  Undo2Icon,
  type LucideIcon,
} from "lucide-react";
import { Fragment, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

interface ToolbarItem {
  label: string;
  /** Shown in the tooltip. */
  shortcut?: string;
  icon: LucideIcon;
  /** Omit for one-off actions such as undo. */
  isActive?: (editor: Editor) => boolean;
  isEnabled?: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
}

const GROUPS: { label: string; items: ToolbarItem[] }[] = [
  {
    label: "History",
    items: [
      {
        label: "Undo",
        shortcut: "Ctrl+Z",
        icon: Undo2Icon,
        isEnabled: (editor) => editor.can().undo(),
        run: (editor) => editor.chain().focus().undo().run(),
      },
      {
        label: "Redo",
        shortcut: "Ctrl+Shift+Z",
        icon: Redo2Icon,
        isEnabled: (editor) => editor.can().redo(),
        run: (editor) => editor.chain().focus().redo().run(),
      },
    ],
  },
  {
    label: "Block type",
    items: [
      {
        label: "Paragraph",
        icon: PilcrowIcon,
        isActive: (editor) => editor.isActive("paragraph"),
        run: (editor) => editor.chain().focus().setParagraph().run(),
      },
      ...([1, 2, 3] as const).map(
        (level): ToolbarItem => ({
          label: `Heading ${level}`,
          icon: [Heading1Icon, Heading2Icon, Heading3Icon][level - 1]!,
          isActive: (editor) => editor.isActive("heading", { level }),
          run: (editor) => editor.chain().focus().toggleHeading({ level }).run(),
        }),
      ),
    ],
  },
  {
    label: "Text style",
    items: [
      {
        label: "Bold",
        shortcut: "Ctrl+B",
        icon: BoldIcon,
        isActive: (editor) => editor.isActive("bold"),
        run: (editor) => editor.chain().focus().toggleBold().run(),
      },
      {
        label: "Italic",
        shortcut: "Ctrl+I",
        icon: ItalicIcon,
        isActive: (editor) => editor.isActive("italic"),
        run: (editor) => editor.chain().focus().toggleItalic().run(),
      },
      {
        label: "Underline",
        shortcut: "Ctrl+U",
        icon: UnderlineIcon,
        isActive: (editor) => editor.isActive("underline"),
        run: (editor) => editor.chain().focus().toggleUnderline().run(),
      },
      {
        label: "Strikethrough",
        icon: StrikethroughIcon,
        isActive: (editor) => editor.isActive("strike"),
        run: (editor) => editor.chain().focus().toggleStrike().run(),
      },
      {
        label: "Inline code",
        icon: CodeIcon,
        isActive: (editor) => editor.isActive("code"),
        run: (editor) => editor.chain().focus().toggleCode().run(),
      },
    ],
  },
  {
    label: "Lists and blocks",
    items: [
      {
        label: "Bulleted list",
        icon: ListIcon,
        isActive: (editor) => editor.isActive("bulletList"),
        run: (editor) => editor.chain().focus().toggleBulletList().run(),
      },
      {
        label: "Numbered list",
        icon: ListOrderedIcon,
        isActive: (editor) => editor.isActive("orderedList"),
        run: (editor) => editor.chain().focus().toggleOrderedList().run(),
      },
      {
        label: "Quote",
        icon: QuoteIcon,
        isActive: (editor) => editor.isActive("blockquote"),
        run: (editor) => editor.chain().focus().toggleBlockquote().run(),
      },
      {
        label: "Code block",
        icon: SquareCodeIcon,
        isActive: (editor) => editor.isActive("codeBlock"),
        run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
      },
    ],
  },
];

const ITEMS = GROUPS.flatMap((group) => group.items);
/** Position of each group's first button within ITEMS. */
const GROUP_OFFSETS = GROUPS.map((_, groupIndex) =>
  GROUPS.slice(0, groupIndex).reduce((count, group) => count + group.items.length, 0),
);

/**
 * Formatting toolbar following the WAI-ARIA toolbar pattern: it is a single
 * Tab stop, and the arrow keys (plus Home/End) move between its buttons.
 * Toggle buttons expose their state with `aria-pressed`.
 */
export function EditorToolbar({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  /** Index of the button that is reachable with Tab. */
  const [tabStop, setTabStop] = useState(0);

  // Re-renders the toolbar only when one of these values actually changes.
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      ITEMS.map((item) => ({
        active: item.isActive?.(current) ?? false,
        enabled: item.isEnabled?.(current) ?? true,
      })),
    equalityFn: (a, b) =>
      b !== null && a.every((item, i) => item.active === b[i]?.active && item.enabled === b[i]?.enabled),
  });

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = [
      ...(toolbarRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []),
    ];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current === -1) return;

    const next = {
      ArrowRight: (current + 1) % buttons.length,
      ArrowLeft: (current - 1 + buttons.length) % buttons.length,
      Home: 0,
      End: buttons.length - 1,
    }[event.key];
    if (next === undefined) return;

    event.preventDefault();
    const target = buttons[next];
    if (!target) return;
    setTabStop(Number(target.dataset.index));
    target.focus();
  }

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Formatting"
      aria-orientation="horizontal"
      aria-disabled={disabled}
      onKeyDown={handleKeyDown}
      className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-2 py-1.5"
    >
      {GROUPS.map((group, groupIndex) => (
        <Fragment key={group.label}>
          {groupIndex > 0 ? <span aria-hidden className="mx-1 h-5 w-px bg-border" /> : null}
          <div role="group" aria-label={group.label} className="flex items-center gap-0.5">
            {group.items.map((item, positionInGroup) => {
              const itemIndex = (GROUP_OFFSETS[groupIndex] ?? 0) + positionInGroup;
              const { active, enabled } = state[itemIndex] ?? { active: false, enabled: true };
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  data-index={itemIndex}
                  tabIndex={itemIndex === tabStop ? 0 : -1}
                  onFocus={() => setTabStop(itemIndex)}
                  disabled={disabled || !enabled}
                  aria-label={item.label}
                  aria-pressed={item.isActive ? active : undefined}
                  title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
                  // Keep the text selection: the button must not take focus on mouse down.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => item.run(editor)}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors",
                    "hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    "disabled:pointer-events-none disabled:opacity-40",
                    active && "bg-accent text-foreground",
                  )}
                >
                  <Icon aria-hidden className="size-4" />
                </button>
              );
            })}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
