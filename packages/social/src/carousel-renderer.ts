// ============================================================
// BODHI — Carousel Renderer
// Renders carousel slides from structured data to 1080x1080 PNGs
// using Puppeteer (HTML → screenshot).
// ============================================================

import puppeteer from "puppeteer";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
export interface CarouselSlide {
  title: string;
  body: string;
  code?: string;
  imageUrl?: string;
}

export interface RenderResult {
  lessonNumber: number;
  slideCount: number;
  outputDir: string;
  files: string[];
}

/**
 * Render carousel slides to 1080x1080 PNG images.
 */
export async function renderSlides(
  slides: CarouselSlide[],
  lessonNumber: number,
  outputDir: string,
): Promise<RenderResult> {
  await mkdir(outputDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const files: string[] = [];

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1080 });

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const isFirst = i === 0;
      const isLast = i === slides.length - 1;
      const html = buildSlideHTML(slide, lessonNumber, i + 1, slides.length, isFirst, isLast);

      await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 10000 });
      // Brief pause for font loading
      await new Promise((r) => setTimeout(r, 500));

      const fileName = `carousel-${lessonNumber}-${i + 1}.png`;
      const filePath = join(outputDir, fileName);
      await page.screenshot({ path: filePath, type: "png" });
      files.push(filePath);
    }
  } finally {
    await browser.close();
  }

  return {
    lessonNumber,
    slideCount: slides.length,
    outputDir,
    files,
  };
}

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSlideHTML(
  slide: CarouselSlide,
  lessonNumber: number,
  slideIndex: number,
  totalSlides: number,
  isFirst: boolean,
  isLast: boolean,
): string {
  const codeBlock = slide.code
    ? `<div class="code-block"><pre><code>${escapeHTML(slide.code)}</code></pre></div>`
    : "";

  const bodyHTML = escapeHTML(slide.body).replace(/\n/g, "<br>");

  const progressDots = Array.from({ length: totalSlides }, (_, i) =>
    `<span class="dot ${i + 1 === slideIndex ? 'active' : ''}"></span>`
  ).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: 1080px;
    height: 1080px;
    background: #0c0a09;
    color: #e7e5e4;
    font-family: 'Inter', -apple-system, sans-serif;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .header {
    padding: 40px 50px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .brand-icon {
    width: 36px;
    height: 36px;
    background: linear-gradient(135deg, #f59e0b, #d97706);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 800;
    color: #0c0a09;
  }

  .brand-text {
    font-size: 16px;
    font-weight: 600;
    color: #a8a29e;
    letter-spacing: 0.5px;
  }

  .lesson-badge {
    font-size: 13px;
    font-weight: 600;
    color: #d97706;
    background: rgba(217, 119, 6, 0.12);
    padding: 6px 14px;
    border-radius: 20px;
    letter-spacing: 0.3px;
  }

  .content {
    flex: 1;
    padding: 40px 50px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 28px;
  }

  .title {
    font-size: ${isFirst ? '42px' : '36px'};
    font-weight: 800;
    line-height: 1.2;
    color: #fafaf9;
    letter-spacing: -0.5px;
  }

  .body {
    font-size: 22px;
    line-height: 1.6;
    color: #a8a29e;
    max-width: 920px;
  }

  .code-block {
    background: #1c1917;
    border: 1px solid #292524;
    border-radius: 12px;
    padding: 24px 28px;
    overflow: hidden;
  }

  .code-block pre {
    margin: 0;
  }

  .code-block code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 18px;
    line-height: 1.6;
    color: #d6d3d1;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .footer {
    padding: 0 50px 36px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .watermark {
    font-size: 14px;
    color: #57534e;
    font-weight: 500;
  }

  .dots {
    display: flex;
    gap: 8px;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #292524;
  }

  .dot.active {
    background: #d97706;
    width: 24px;
    border-radius: 4px;
  }

  .cta {
    font-size: 20px;
    font-weight: 600;
    color: #d97706;
    text-align: center;
    margin-top: 8px;
  }

  .swipe-hint {
    font-size: 15px;
    color: #57534e;
    text-align: center;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <div class="brand-icon">AI</div>
      <span class="brand-text">AI Бүтээгч</span>
    </div>
    <span class="lesson-badge">Хичээл #${lessonNumber}</span>
  </div>

  <div class="content">
    <div class="title">${escapeHTML(slide.title)}</div>
    <div class="body">${bodyHTML}</div>
    ${codeBlock}
    ${isFirst ? '<p class="swipe-hint">Баруун тийш шударна уу →</p>' : ''}
    ${isLast ? '<p class="cta">Хадгалаад найздаа илгээгээрэй!</p>' : ''}
  </div>

  <div class="footer">
    <span class="watermark">@sukhbat</span>
    <div class="dots">${progressDots}</div>
  </div>
</body>
</html>`;
}
