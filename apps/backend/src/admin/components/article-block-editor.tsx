import { BlockNoteSchema, createHeadingBlockSpec, defaultBlockSpecs, type PartialBlock } from "@blocknote/core"
import { ru } from "@blocknote/core/locales"
import { BlockNoteView } from "@blocknote/mantine"
import { useCreateBlockNote } from "@blocknote/react"
import { useEffect, useState } from "react"
import { sdk } from "../lib/sdk"
import type { ArticleDocument } from "../../modules/content/article-document"
import { safeContentUrl } from "../../modules/content/validation"
import "@blocknote/mantine/style.css"
import "./article-block-editor.css"

const schema = BlockNoteSchema.create({ blockSpecs: {
  paragraph: defaultBlockSpecs.paragraph,
  heading: createHeadingBlockSpec({ levels: [2, 3, 4] }),
  bulletListItem: defaultBlockSpecs.bulletListItem,
  numberedListItem: defaultBlockSpecs.numberedListItem,
  checkListItem: defaultBlockSpecs.checkListItem,
  quote: defaultBlockSpecs.quote,
  image: defaultBlockSpecs.image,
  table: defaultBlockSpecs.table,
} })

export default function ArticleBlockEditor({ initial, disabled, onChange, onUpload }: { initial: ArticleDocument; disabled: boolean; onChange: (document: ArticleDocument) => void; onUpload: (delta: 1 | -1) => void }) {
  const [theme, setTheme] = useState<"light" | "dark">(() => document.documentElement.classList.contains("dark") ? "dark" : "light")
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light"))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])
  const editor = useCreateBlockNote({
    schema, dictionary: ru,
    domAttributes: { editor: { "aria-label": "Содержимое статьи", "aria-multiline": "true" } },
    links: { isValidLink: safeContentUrl, HTMLAttributes: { rel: "noopener noreferrer" } },
    initialContent: initial.blocks.length ? initial.blocks as unknown as PartialBlock<typeof schema.blockSchema>[] : undefined,
    uploadFile: async (file) => {
      if (file.size > 10 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) throw new Error("Выберите JPG, PNG, WebP или AVIF размером до 10 МБ")
      onUpload(1)
      try {
        const { files } = await sdk.admin.upload.create({ files: [file] })
        if (!files[0]?.url) throw new Error("Не удалось загрузить изображение")
        return files[0].url
      } finally { onUpload(-1) }
    },
  })
  return <BlockNoteView editor={editor} editable={!disabled} theme={theme} className="article-block-editor" onChange={() => onChange({ version: 1, blocks: editor.document as unknown as ArticleDocument["blocks"] })} />
}
