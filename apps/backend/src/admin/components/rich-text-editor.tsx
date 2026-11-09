import { Button, DropdownMenu, Input, Text } from "@medusajs/ui"
import { TableKit } from "@tiptap/extension-table"
import Subscript from "@tiptap/extension-subscript"
import Superscript from "@tiptap/extension-superscript"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { useId, useState } from "react"
import { safeDescriptionHref } from "../../lib/description-link"

const headingLevels = [2, 3, 4, 5] as const
const extensions = [
  StarterKit.configure({
    heading: { levels: [...headingLevels] },
    code: false,
    codeBlock: false,
    horizontalRule: false,
    trailingNode: false,
    link: { openOnClick: false, defaultProtocol: "https", HTMLAttributes: { target: null, rel: null } },
  }),
  TableKit,
  Subscript,
  Superscript,
]

export function RichTextEditor({ label, html, text = "", onChange }: {
  label: string
  html?: string
  text?: string
  onChange: (html: string, text: string) => void
}) {
  const id = useId()
  const [link, setLink] = useState<string>()
  const [linkError, setLinkError] = useState(false)
  const editor = useEditor({
    extensions,
    content: html ?? { type: "doc", content: text.split(/\r?\n/).map((line) => ({
      type: "paragraph", content: line ? [{ type: "text", text: line }] : [],
    })) },
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-labelledby": id,
        "aria-multiline": "true",
        class: "min-h-52 break-words px-4 py-3 text-sm leading-relaxed outline-none [&_p+p]:mt-2 [&_h2]:my-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:my-2 [&_h3]:text-base [&_h3]:font-semibold [&_h4]:my-2 [&_h4]:font-semibold [&_h5]:font-semibold [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_a]:text-ui-fg-interactive [&_a]:underline [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:bg-ui-bg-subtle [&_th]:p-2 [&_.tableWrapper]:overflow-auto",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML(), editor.getText({ blockSeparator: "\n" })),
  })

  const applyLink = () => {
    if (!editor || link === undefined) return
    const value = link.trim()
    const href = safeDescriptionHref(/^(?:[a-z][a-z\d+.-]*:|[\/#])/i.test(value) ? value : `https://${value}`)
    if (!href) { setLinkError(true); return }
    const command = editor.chain().focus()
    if (editor.state.selection.empty && !editor.isActive("link")) {
      command.insertContent({ type: "text", text: value, marks: [{ type: "link", attrs: { href } }] }).run()
    } else command.extendMarkRange("link").setLink({ href }).run()
    setLink(undefined)
  }

  return <section className="min-w-0 space-y-2">
    <Text size="small" weight="plus" id={id}>{label}</Text>
    <div className="overflow-hidden rounded-md border border-ui-border-base bg-ui-bg-field focus-within:border-ui-border-interactive">
      {editor && <div role="group" aria-label={`Форматирование · ${label}`} className="flex flex-wrap items-center gap-1 border-b border-ui-border-base bg-ui-bg-subtle p-2">
        <DropdownMenu>
          <DropdownMenu.Trigger asChild><Button type="button" variant="secondary" size="small" aria-label="Стиль абзаца">
            {headingLevels.find((level) => editor.isActive("heading", { level })) ? "Заголовок" : "Абзац"}
          </Button></DropdownMenu.Trigger>
          <DropdownMenu.Content>
            <DropdownMenu.Item onSelect={() => editor.chain().focus().setParagraph().run()}>Обычный текст</DropdownMenu.Item>
            {headingLevels.map((level) => <DropdownMenu.Item key={level} onSelect={() => editor.chain().focus().setHeading({ level }).run()}>Заголовок {level - 1}</DropdownMenu.Item>)}
          </DropdownMenu.Content>
        </DropdownMenu>
        {[
          { name: "Жирный", mark: "bold", run: () => editor.chain().focus().toggleBold().run() },
          { name: "Курсив", mark: "italic", run: () => editor.chain().focus().toggleItalic().run() },
          { name: "Подчёркнутый", mark: "underline", run: () => editor.chain().focus().toggleUnderline().run() },
          { name: "Список", mark: "bulletList", run: () => editor.chain().focus().toggleBulletList().run() },
          { name: "Нумерация", mark: "orderedList", run: () => editor.chain().focus().toggleOrderedList().run() },
          { name: "Цитата", mark: "blockquote", run: () => editor.chain().focus().toggleBlockquote().run() },
        ].map(({ name, mark, run }) => <Button key={mark} type="button" variant={editor.isActive(mark) ? "secondary" : "transparent"}
          size="small" aria-pressed={editor.isActive(mark)} onClick={run}>{name}</Button>)}
        <Button type="button" size="small" variant={editor.isActive("link") ? "secondary" : "transparent"} aria-expanded={link !== undefined} onClick={() => {
          setLinkError(false)
          setLink(link === undefined ? editor.getAttributes("link").href ?? "" : undefined)
        }}>Ссылка</Button>
        <DropdownMenu>
          <DropdownMenu.Trigger asChild><Button type="button" size="small" variant="transparent">Таблица</Button></DropdownMenu.Trigger>
          <DropdownMenu.Content>
            <DropdownMenu.Item onSelect={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>Вставить таблицу 3 × 3</DropdownMenu.Item>
            {editor.isActive("table") && <>
              <DropdownMenu.Item onSelect={() => editor.chain().focus().addRowAfter().run()}>Добавить строку ниже</DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => editor.chain().focus().addColumnAfter().run()}>Добавить столбец справа</DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => editor.chain().focus().deleteRow().run()}>Удалить строку</DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => editor.chain().focus().deleteColumn().run()}>Удалить столбец</DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => editor.chain().focus().deleteTable().run()}>Удалить таблицу</DropdownMenu.Item>
            </>}
          </DropdownMenu.Content>
        </DropdownMenu>
        <div className="flex gap-1 sm:ml-auto">
          <Button type="button" variant="transparent" size="small" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>Отменить</Button>
          <Button type="button" variant="transparent" size="small" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>Повторить</Button>
        </div>
      </div>}
      {link !== undefined && <div className="space-y-2 border-b border-ui-border-base p-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input autoFocus className="min-w-48 flex-1" aria-label="Адрес ссылки" aria-invalid={linkError} placeholder="https://…" value={link}
            onChange={(event) => { setLink(event.target.value); setLinkError(false) }}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyLink() } }} />
          <Button type="button" size="small" variant="secondary" disabled={!link.trim()} onClick={applyLink}>Применить ссылку</Button>
          {editor?.isActive("link") && <Button type="button" size="small" variant="transparent" onClick={() => {
            editor.chain().focus().extendMarkRange("link").unsetLink().run()
            setLink(undefined)
          }}>Убрать ссылку</Button>}
        </div>
        {linkError && <Text size="xsmall" role="alert" className="text-ui-fg-error">Проверьте адрес ссылки.</Text>}
      </div>}
      <EditorContent editor={editor} />
    </div>
  </section>
}
