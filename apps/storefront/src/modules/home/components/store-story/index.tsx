import Image from "next/image"
import source from "../../data/source-preview.json"
import { storyArtwork } from "../../data/story-artwork"

export default function StoreStory() {
  return <section className="texno-story texno-section" aria-labelledby="store-heading">
    <div className="texno-container"><article className="texno-rich-content">
      {source.story.map((section, index) => <section key={section.title} className={`texno-story-row ${storyArtwork[index] ? "has-artwork" : "is-text-only"}`}>
        {index === 0 ? <h1 id="store-heading">{section.title}</h1> : <h2>{section.title}</h2>}
        <div className="texno-story-row-copy">{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
        {storyArtwork[index] && <figure><Image src={storyArtwork[index].src} alt={storyArtwork[index].alt} width={storyArtwork[index].width} height={storyArtwork[index].height} loading="lazy" sizes="(max-width: 800px) 95vw, (max-width: 1440px) 46vw, 660px" /></figure>}
      </section>)}
    </article></div>
  </section>
}
