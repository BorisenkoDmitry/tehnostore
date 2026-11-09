import Image from "next/image"

export type StoryData = { sections: { title: string; paragraphs: string[] }[]; artwork: { src: string; alt: string; width: number; height: number }[] }
export default function StoreStory({ sections, artwork }: StoryData) {
  const [intro, ...details] = sections
  const introArtwork = artwork[0]
  if (!intro || !introArtwork) return null

  return <section className="texno-story texno-section" aria-labelledby="store-heading">
    <div className="texno-container"><article className="texno-rich-content">
      <section className="texno-story-row has-artwork">
        <h1 id="store-heading">{intro.title}</h1>
        <div className="texno-story-row-copy">{intro.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
        <figure><Image src={introArtwork.src} alt={introArtwork.alt} width={introArtwork.width} height={introArtwork.height} loading="lazy" sizes="(max-width: 800px) 95vw, (max-width: 1440px) 46vw, 660px" /></figure>
      </section>
      <div className="texno-home-story-tiles">
        {details.map((section, index) => <section key={section.title} className="texno-home-story-tile" aria-labelledby={`home-story-detail-${index}`}>
          <h2 id={`home-story-detail-${index}`}>{section.title}</h2>
          <div className="texno-story-row-copy">{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
        </section>)}
      </div>
    </article></div>
  </section>
}
