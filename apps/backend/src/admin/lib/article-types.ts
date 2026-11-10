import type { ContentMetadata, ContentNode } from "../../modules/content/types"
import type { ArticleDocument } from "../../modules/content/article-document"

export type Article = { id: string; slug: string; title: string; excerpt: string; cover_image: string; cover_alt: string; body: ContentNode[] | ArticleDocument; metadata: ContentMetadata; revision: number; created_at: string; updated_at: string }
export type ArticleDraft = Pick<Article, "title" | "slug" | "excerpt" | "cover_image" | "cover_alt" | "body" | "metadata"> & { id?: string; revision?: number }
export const emptyArticle = (): ArticleDraft => ({ title: "", slug: "", excerpt: "", cover_image: "", cover_alt: "", body: { version: 1, blocks: [] }, metadata: { noindex: true } })
