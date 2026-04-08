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

function highlightCode(code: string): string {
  return code
    // Comments
    .replace(/(#[^\n]*)/g, '<span style="color:#6b7280">$1</span>')
    // Strings
    .replace(/(&quot;[^&]*&quot;)/g, '<span style="color:#34d399">$1</span>')
    // Commands/keywords
    .replace(/\b(npm|node|claude|cd|curl|git|mkdir|ls)\b/g, '<span style="color:#f59e0b">$1</span>')
    // Flags
    .replace(/(\s-[a-zA-Z]+)/g, '<span style="color:#60a5fa">$1</span>');
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
    ? `<div class="code-block"><div class="code-header"><span class="code-dot"></span><span class="code-dot"></span><span class="code-dot"></span></div><pre><code>${highlightCode(escapeHTML(slide.code))}</code></pre></div>`
    : "";

  const bodyHTML = escapeHTML(slide.body).replace(/\n/g, "<br>");

  const progressDots = Array.from({ length: totalSlides }, (_, i) =>
    `<span class="dot ${i + 1 === slideIndex ? 'active' : ''}"></span>`
  ).join("");

  // Consistent brand accent with subtle variation per slide
  const accents = ["#d97706", "#2563eb", "#059669", "#7c3aed", "#dc2626", "#0891b2"];
  const accent = accents[(slideIndex - 1) % accents.length];
  const brandAccent = "#d97706"; // consistent amber for brand elements

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
    position: relative;
  }

  /* Gradient glow in corner */
  body::before {
    content: '';
    position: absolute;
    top: -200px;
    right: -200px;
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, ${accent}15, transparent 70%);
    pointer-events: none;
  }

  body::after {
    content: '';
    position: absolute;
    bottom: -150px;
    left: -150px;
    width: 400px;
    height: 400px;
    background: radial-gradient(circle, ${accent}08, transparent 70%);
    pointer-events: none;
  }

  .accent-line {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear-gradient(90deg, ${accent}, ${accent}00);
  }

  .header {
    padding: 48px 60px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
    z-index: 1;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .brand-icon {
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, ${accent}, ${accent}cc);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 800;
    color: #0c0a09;
  }

  .brand-text {
    font-size: 17px;
    font-weight: 600;
    color: #78716c;
    letter-spacing: 0.5px;
  }

  .lesson-badge {
    font-size: 13px;
    font-weight: 600;
    color: ${accent};
    background: ${accent}18;
    padding: 7px 16px;
    border-radius: 20px;
    border: 1px solid ${accent}30;
  }

  .slide-number {
    position: absolute;
    top: 48px;
    left: 60px;
    font-size: 120px;
    font-weight: 900;
    color: #1c191708;
    line-height: 1;
    pointer-events: none;
    z-index: 0;
  }

  .content {
    flex: 1;
    padding: 50px 60px 30px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 24px;
    position: relative;
    z-index: 1;
  }

  .step-badge {
    position: absolute;
    top: 48px;
    right: 60px;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: ${accent};
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    font-weight: 800;
    color: #0c0a09;
    z-index: 2;
  }

  .title {
    font-size: ${isFirst ? '52px' : '44px'};
    font-weight: 800;
    line-height: 1.15;
    color: #fafaf9;
    letter-spacing: -0.5px;
    max-width: 900px;
  }

  .title-accent {
    display: inline;
    background: linear-gradient(135deg, ${accent}, ${accent}bb);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .divider {
    width: 60px;
    height: 3px;
    background: ${accent};
    border-radius: 2px;
  }

  .body {
    font-size: 26px;
    line-height: 1.6;
    color: #a8a29e;
    max-width: 920px;
  }

  .code-block {
    background: #1c1917;
    border: 1px solid #292524;
    border-radius: 14px;
    overflow: hidden;
  }

  .code-header {
    padding: 12px 20px;
    display: flex;
    gap: 8px;
    border-bottom: 1px solid #292524;
  }

  .code-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #292524;
  }

  .code-dot:nth-child(1) { background: #ef4444; }
  .code-dot:nth-child(2) { background: #f59e0b; }
  .code-dot:nth-child(3) { background: #22c55e; }

  .code-block pre {
    margin: 0;
    padding: 20px 24px;
  }

  .code-block code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 20px;
    line-height: 1.6;
    color: #e7e5e4;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .footer {
    padding: 0 60px 44px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
    z-index: 1;
  }

  .watermark {
    font-size: 14px;
    color: #44403c;
    font-weight: 500;
    letter-spacing: 0.5px;
  }

  .dots {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #292524;
  }

  .dot.active {
    background: ${accent};
    width: 28px;
    border-radius: 4px;
  }

  .cta {
    font-size: 22px;
    font-weight: 700;
    color: ${accent};
    text-align: center;
    margin-top: 12px;
  }

  .swipe-hint {
    font-size: 15px;
    color: #57534e;
    text-align: center;
    letter-spacing: 1px;
  }
</style>
</head>
<body>
  <div class="accent-line"></div>
  ${!isFirst ? `<div class="step-badge">${slideIndex}</div>` : ''}

  <div class="header">
    <div class="brand">
      <div class="brand-icon">AI</div>
      <span class="brand-text">AI Бүтээгч</span>
    </div>
    <span class="lesson-badge">#${lessonNumber} · ${slideIndex}/${totalSlides}</span>
  </div>

  <div class="content">
    <div class="title">${escapeHTML(slide.title)}</div>
    <div class="divider"></div>
    <div class="body">${bodyHTML}</div>
    ${codeBlock}
    ${isFirst ? '<p class="swipe-hint">БАРУУН ТИЙШ ШУДАРНА УУ →</p>' : ''}
    ${isLast ? '<p class="cta">Хадгалаад найздаа илгээгээрэй! 🔥</p>' : ''}
  </div>

  <div class="footer">
    <span class="watermark">@sukhbat</span>
    <div class="dots">${progressDots}</div>
  </div>
</body>
</html>`;
}
