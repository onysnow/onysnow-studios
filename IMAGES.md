# Adding Ony's photographs

The photographs currently used by the site are **temporary placeholders**. Replace every one with Ony’s own work before the final launch.

## Export from Lightroom

For gallery photographs, export JPEGs with the long edge around **2560px**. For full-width opening photographs, use a long edge around **3840px**. Choose **sRGB**, JPEG **quality 80**, and do not add watermarks or output sharpening beyond what the photograph needs.

## Add a photograph

1. Put the exported file in `src/assets/`. Use a short descriptive filename such as `candid-rainy-street.jpg`.
2. Open `src/data/portfolio.ts`.
3. Copy one photograph’s four imports: the regular WebP, AVIF responsive set, WebP responsive set, and tiny blurred placeholder. Change only the filename.
4. Add or update its manifest entry with the category, title, useful alt text, orientation, and original pixel dimensions.

The site sends every photograph through the shared `Img` component. That automatically gives it responsive AVIF and WebP versions, reserves its space to stop page jumping, loads off-screen images lazily, and fades from a tiny blurred preview.

## Writing alt text

Describe what a person needs to understand from the photograph: the subject, action, setting, and useful visual mood. Avoid “image of” and avoid keyword stuffing.
