# Hero device image refresh guide

Use this checklist when you need to regenerate the high-DPI hero renders for the iPhone 15 Pro Max and Samsung Galaxy S24 Ultra. The commands below assume you have ImageMagick installed (macOS: `brew install imagemagick`; Linux: `sudo apt-get install imagemagick`).

## General notes
- Start from the highest-resolution source you have (PNG/WEBP/PSD export). Place the source files in the same directory as the outputs.
- Keep the 1x/2x filenames that the site already references:
  - iPhone: `/iphone/assets/i15pm-500.webp` and `/iphone/assets/i15pm-1000.webp`.
  - Samsung: `/samsung/assets/s24u-500.webp` and `/samsung/assets/s24u-1000.webp`.
- The target display sizes are 500×625 (iPhone) and 500×500 (Samsung). The 2x versions should therefore be 1000×1250 and 1000×1000 for crispness on retina displays.
- Generated assets are not tracked in git; upload them to your CDN or hosting location after creation.

## iPhone 15 Pro Max hero (500×625 @1x, 1000×1250 @2x)
```bash
cd /workspace/BuyBacking
# Replace i15pm-source.png with your high-res original (>= 1000x1250)
magick iphone/assets/i15pm-source.png -resize 500x625 -strip -quality 88 iphone/assets/i15pm-500.webp
magick iphone/assets/i15pm-source.png -resize 1000x1250 -strip -quality 88 iphone/assets/i15pm-1000.webp
# Verify dimensions
magick identify iphone/assets/i15pm-500.webp iphone/assets/i15pm-1000.webp
```

## Samsung Galaxy S24 Ultra hero (500×500 @1x, 1000×1000 @2x)
```bash
cd /workspace/BuyBacking
# Replace s24u-source.png with your high-res original (>= 1000x1000)
magick samsung/assets/s24u-source.png -resize 500x500 -strip -quality 88 samsung/assets/s24u-500.webp
magick samsung/assets/s24u-source.png -resize 1000x1000 -strip -quality 88 samsung/assets/s24u-1000.webp
# Verify dimensions
magick identify samsung/assets/s24u-500.webp samsung/assets/s24u-1000.webp
```

## Optional: tighten file sizes
If you want even smaller files while keeping quality high, run `cwebp` after the ImageMagick resize:
```bash
cwebp -q 82 -m 6 iphone/assets/i15pm-1000.webp -o iphone/assets/i15pm-1000.webp
cwebp -q 82 -m 6 samsung/assets/s24u-1000.webp -o samsung/assets/s24u-1000.webp
```
Keep the 500px versions as-is or run the same command on them if you prefer.
