/**
 * HTML 净化与 XSS 防护
 *
 * v5B: 使用 sanitize-html 库替代正则实现，覆盖编码绕过等高级 XSS 向量
 * 保留: stripHtmlTags（纯文本提取）、safeJsonLd（JSON-LD 安全输出）
 */

import sanitize from 'sanitize-html'

const SANITIZE_OPTIONS: sanitize.IOptions = {
  allowedTags: [
    'p', 'br', 'b', 'i', 'u', 's', 'em', 'strong', 'sub', 'sup',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'div', 'span', 'hr',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'loading'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
    table: ['border', 'cellpadding', 'cellspacing'],
    '*': ['class', 'style', 'id', 'dir', 'lang'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  // Ban all custom protocols (javascript:, data:, etc.)
  disallowedTagsMode: 'discard',
}

export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') return ''
  return sanitize(html, SANITIZE_OPTIONS).trim()
}

/**
 * 提取纯文本：去掉所有 HTML 标签，解码常见实体
 */
export function stripHtmlTags(html: string): string {
  if (!html || typeof html !== 'string') return ''
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim()
}

/**
 * 安全输出 JSON-LD：转义 </ 防止突破 <script> 标签
 * C-11: 防止 product.name 等用户输入含 </script> 造成 XSS
 */
export function safeJsonLd(json: string): string {
  return json.replace(/<\//g, '<\\/')
}
