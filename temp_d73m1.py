import os, re

base = r"D:\mlm-platform-source\mlm-platform\src\app\api\admin"

# Helper: standardize a file with simple patterns
def standardize(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # More aggressive regex - handle template literals and multiline
    # Pattern: NextResponse.json({ ... }, { status: N }) -> errorResponse
    # We need to handle multi-line patterns

    # Replace the import
    if "from '@/lib/api-response'" not in content:
        content = re.sub(
            r"(import\s*\{[^}]*\}\s*from\s*'next/server'\s*)",
            r"\1\nimport { errorResponse, successResponse } from '@/lib/api-response'",
            content
        )

    # Multi-line aware: find all NextResponse.json({...}, {status: N}) patterns
    # and replace them

    # Simple single-line patterns first
    content = re.sub(
        r'NextResponse\.json\(\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}\s*,\s*\{\s*status:\s*(\d+)\s*\}\s*\)',
        lambda m: f"errorResponse({m.group(1).strip().split(':',1)[1].strip() if ':' in m.group(1) else m.group(1)}, {m.group(2)})",
        content
    )

    # Remove NextResponse from import if no longer used
    if 'NextResponse.' not in content and 'NextResponse>' not in content and 'NextResponse}' not in content:
        content = re.sub(r"import\s*\{\s*NextResponse\s*\}\s*from\s*'next/server';\s*\n?", '', content)
        content = re.sub(r"import\s*\{\s*NextRequest\s*,\s*NextResponse\s*\}\s*from\s*'next/server';\s*\n?", "import { NextRequest } from 'next/server'\n", content)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"OK: {os.path.relpath(filepath, base)}")

# Batch 1: smaller files
files = [
    r"orders\route.ts",
    r"points\void\route.ts",
    r"products\[id]\duplicate\route.ts",
    r"recharge\route.ts",
    r"recharge\[id]\route.ts",
    r"recharge\[id]\audit-logs\route.ts",
]
for f in files:
    filepath = os.path.join(base, f)
    if os.path.exists(filepath):
        standardize(filepath)
