// TEMPORARY PLACEHOLDERS: Every photograph below must be replaced with Ony's own photographs before the final launch.
import candidSrc from "@/assets/candid-city.jpg?w=1600&format=webp";
import candidAvif from "@/assets/candid-city.jpg?w=480;768;1200;1600&format=avif&as=srcset";
import candidWebp from "@/assets/candid-city.jpg?w=480;768;1200;1600&format=webp&as=srcset";
import candidBlur from "@/assets/candid-city.jpg?w=32&format=webp&blur=8";
import eventSrc from "@/assets/event-dance.jpg?w=1600&format=webp";
import eventAvif from "@/assets/event-dance.jpg?w=480;768;1200;1600&format=avif&as=srcset";
import eventWebp from "@/assets/event-dance.jpg?w=480;768;1200;1600&format=webp&as=srcset";
import eventBlur from "@/assets/event-dance.jpg?w=32&format=webp&blur=8";
import portraitSrc from "@/assets/portrait-window.jpg?w=1600&format=webp";
import portraitAvif from "@/assets/portrait-window.jpg?w=480;768;1200;1600&format=avif&as=srcset";
import portraitWebp from "@/assets/portrait-window.jpg?w=480;768;1200;1600&format=webp&as=srcset";
import portraitBlur from "@/assets/portrait-window.jpg?w=32&format=webp&blur=8";
import fineArtSrc from "@/assets/fine-art-red.jpg?w=1600&format=webp";
import fineArtAvif from "@/assets/fine-art-red.jpg?w=480;768;1200;1600&format=avif&as=srcset";
import fineArtWebp from "@/assets/fine-art-red.jpg?w=480;768;1200;1600&format=webp&as=srcset";
import fineArtBlur from "@/assets/fine-art-red.jpg?w=32&format=webp&blur=8";
import cosplaySrc from "@/assets/cosplay-neon.jpg?w=1600&format=webp";
import cosplayAvif from "@/assets/cosplay-neon.jpg?w=480;768;1200;1600&format=avif&as=srcset";
import cosplayWebp from "@/assets/cosplay-neon.jpg?w=480;768;1200;1600&format=webp&as=srcset";
import cosplayBlur from "@/assets/cosplay-neon.jpg?w=32&format=webp&blur=8";
import streetSrc from "@/assets/street-night.jpg?w=1600&format=webp";
import streetAvif from "@/assets/street-night.jpg?w=480;768;1200;1600&format=avif&as=srcset";
import streetWebp from "@/assets/street-night.jpg?w=480;768;1200;1600&format=webp&as=srcset";
import streetBlur from "@/assets/street-night.jpg?w=32&format=webp&blur=8";

export const categorySlugs = ["candid", "events", "portraits", "fine-art", "cosplay", "street"] as const;
export type CategorySlug = (typeof categorySlugs)[number];
export type Orientation = "landscape" | "portrait";

export type PortfolioImage = {
  id: string;
  category: CategorySlug;
  categoryLabel: string;
  title: string;
  alt: string;
  orientation: Orientation;
  width: number;
  height: number;
  src: string;
  avifSrcSet: string;
  webpSrcSet: string;
  blurSrc: string;
};

const sourceByCategory = {
  candid: { src: candidSrc, avifSrcSet: candidAvif, webpSrcSet: candidWebp, blurSrc: candidBlur, width: 1536, height: 1024 },
  events: { src: eventSrc, avifSrcSet: eventAvif, webpSrcSet: eventWebp, blurSrc: eventBlur, width: 1536, height: 1024 },
  portraits: { src: portraitSrc, avifSrcSet: portraitAvif, webpSrcSet: portraitWebp, blurSrc: portraitBlur, width: 1024, height: 1536 },
  "fine-art": { src: fineArtSrc, avifSrcSet: fineArtAvif, webpSrcSet: fineArtWebp, blurSrc: fineArtBlur, width: 1024, height: 1536 },
  cosplay: { src: cosplaySrc, avifSrcSet: cosplayAvif, webpSrcSet: cosplayWebp, blurSrc: cosplayBlur, width: 1024, height: 1536 },
  street: { src: streetSrc, avifSrcSet: streetAvif, webpSrcSet: streetWebp, blurSrc: streetBlur, width: 1536, height: 1024 },
} satisfies Record<CategorySlug, Omit<PortfolioImage, "id" | "category" | "categoryLabel" | "title" | "alt" | "orientation">>;

const categoryCopy: Record<CategorySlug, { label: string; title: string; alt: string; intro: string }> = {
  candid: { label: "Candid", title: "Between the moments", alt: "Two friends laughing together on a rain-lit city street", intro: "The glances, gestures, and bursts of laughter that happen when nobody is performing for the camera." },
  events: { label: "Events", title: "The room came alive", alt: "A couple dancing together under warm lights at an evening celebration", intro: "The energy of your gathering, photographed from the inside—honestly, colorfully, and without interruption." },
  portraits: { label: "Portraits", title: "Quiet confidence", alt: "A creative professional in natural window light with teal and amber tones", intro: "Portraits with room to breathe: guided enough to feel comfortable, open enough to still feel like you." },
  "fine-art": { label: "Fine Art", title: "Crimson movement", alt: "A dancer moving flowing crimson fabric through teal and amber theatrical light", intro: "Ideas translated into color, gesture, atmosphere, and images made to live beyond the screen." },
  cosplay: { label: "Cosplay", title: "After the rain", alt: "A futuristic cosplayer in a detailed original costume standing in a neon alley", intro: "Craft, character, and world-building treated with the same care as a cinematic production still." },
  street: { label: "Street", title: "Corner light", alt: "A pedestrian with an umbrella passing a glowing corner shop on a rainy night", intro: "Unscripted city stories—light, weather, movement, and the split second where they become one frame." },
};

export const portfolioImages: PortfolioImage[] = categorySlugs.flatMap((category) => {
  const copy = categoryCopy[category];
  const source = sourceByCategory[category];
  const orientation: Orientation = source.height > source.width ? "portrait" : "landscape";
  return [0, 1, 2].map((index) => ({
    id: `${category}-${index + 1}`,
    category,
    categoryLabel: copy.label,
    title: index === 0 ? copy.title : `${copy.title} — Study ${index + 1}`,
    alt: copy.alt,
    orientation,
    ...source,
  }));
});

export const categories = categorySlugs.map((slug) => ({
  slug,
  label: categoryCopy[slug].label,
  intro: categoryCopy[slug].intro,
  cover: portfolioImages.find((image) => image.category === slug) as PortfolioImage,
}));

export function getCategory(slug: string) {
  return categories.find((category) => category.slug === slug);
}
