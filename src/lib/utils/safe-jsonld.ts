/**
 * 安全输出 JSON-LD：转义 </ 防止突破 <script> 标签
 * C-11: 防止用户输入含 </script> 造成 XSS
 *
 * 从 sanitize-html.ts 拆出，避免根布局加载 150 kB 的 sanitize-html 库
 */
export function safeJsonLd(json: string): string {
  return json.replace(/<\//g, '<\\/')
}
