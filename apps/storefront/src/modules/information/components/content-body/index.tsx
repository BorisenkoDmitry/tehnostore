import type { ContentNode } from "@lib/data/content"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import styles from "./content-body.module.css"
import InlineText from "./inline-text"

export default function ContentBody({ nodes }: { nodes: ContentNode[] }) {
  return <div className={styles.body}>{nodes.map((node, index) => {
    if (node.type === "heading") {
      if (node.level === 2) return <h2 key={index}><InlineText text={node.text} /></h2>
      if (node.level === 3) return <h3 key={index}><InlineText text={node.text} /></h3>
      return <h4 key={index}><InlineText text={node.text} /></h4>
    }
    if (node.type === "paragraph") return <p key={index}><InlineText text={node.text} /></p>
    if (node.type === "list") {
      const items = node.items.map((item, position) => <li key={position}><InlineText text={item} /></li>)
      return node.ordered ? <ol key={index}>{items}</ol> : <ul key={index}>{items}</ul>
    }
    if (node.type === "table") return <div className={styles.table} key={index} tabIndex={0} role="region" aria-label={node.headers.join(", ")}><table><thead><tr>{node.headers.map((header, position) => <th scope="col" key={position}><InlineText text={header} /></th>)}</tr></thead><tbody>{node.rows.map((row, position) => <tr key={position}>{row.map((cell, column) => <td key={column}><InlineText text={cell} /></td>)}</tr>)}</tbody></table></div>
    if (node.type === "quote") return <blockquote key={index}><p><InlineText text={node.text} /></p>{node.author && <cite>{node.author}</cite>}</blockquote>
    if (node.type === "image") return <figure key={index}><img src={node.url} alt={node.alt} loading="lazy" /></figure>
    if (node.type === "link") return <p key={index}>{node.href.startsWith("/") ? <LocalizedClientLink href={node.href}>{node.text}</LocalizedClientLink> : <a href={node.href} rel="noopener noreferrer">{node.text}</a>}</p>
    return null
  })}</div>
}
