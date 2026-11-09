import type { ContentBlock } from "@lib/data/content"
import InlineText from "./inline-text"
import styles from "./content-body.module.css"

export default function ContentBlocks({ blocks }: { blocks: ContentBlock[] }) {
  return <>{[...blocks].filter((block) => block.enabled && block.type === "text").sort((a, b) => a.order - b.order).map((block) => <section key={block.id} className={styles.body} style={{ marginBlock: 32 }}>
    {typeof block.data.title === "string" && block.data.title && <h2><InlineText text={block.data.title} /></h2>}
    {typeof block.data.text === "string" && <p style={{ whiteSpace: "pre-line" }}><InlineText text={block.data.text} /></p>}
  </section>)}</>
}
