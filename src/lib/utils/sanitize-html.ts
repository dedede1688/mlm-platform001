/**
 * HTML ???? ? ? XSS
 *
 * v5B: ?????? dangerouslySetInnerHTML ??
 * ??: <script>, <iframe>, <object>, <embed>, javascript: URLs,
 *       on* ?????, <form> ??
 * ??: ????????????
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'b', 'i', 'u', 's', 'em', 'strong', 'sub', 'sup',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'div', 'span', 'hr',
])

const STRIP_TAGS = ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea', 'link', 'meta', 'style', 'applet', 'base', 'frame', 'frameset', 'noframes', 'param', 'source', 'track']

export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') return ''

  let result = html

  // 1. Remove dangerous tags with their content
  for (const tag of STRIP_TAGS) {
    const regex = new RegExp(`<${tag}\b[^>]*>.*?<\/${tag}>`, 'gis')
    result = result.replace(regex, '')
    // Self-closing variants
    const selfClose = new RegExp(`<${tag}\b[^>]*\/>`, 'gis')
    result = result.replace(selfClose, '')
  }

  // 2. Remove on* event handlers from all tags
  result = result.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
  result = result.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '')

  // 3. Remove javascript: URLs
  result = result.replace(/href\s*=\s*["']\s*javascript\s*:[^"']*["']/gi, 'href="#"')
  result = result.replace(/src\s*=\s*["']\s*javascript\s*:[^"']*["']/gi, '')

  // 4. Remove <script> without closing tag (edge case)
  result = result.replace(/<script[^>]*>?/gi, '')
  result = result.replace(/<\/script>/gi, '')

  // 5. Strip data: URLs in src (potential SVG/script injection)
  result = result.replace(/src\s*=\s*["']\s*data\s*:\s*[^"']*["']/gi, '')

  // 6. Remove HTML comments (can hide scripts)
  result = result.replace(/<!--[\s\S]*?-->/g, '')

  return result.trim()
}

/**
 * ????????? stripHtmlTags ??????????? HTML ??
 */
export function stripHtmlTags(html: string): string {
  if (!html || typeof html !== 'string') return ''
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim()
}
