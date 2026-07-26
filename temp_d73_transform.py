import os, re, glob

base = r"D:\mlm-platform-source\mlm-platform\src\app\api\admin"
files = []

for root, dirs, filenames in os.walk(base):
    for fn in filenames:
        if fn == "route.ts":
            files.append(os.path.join(root, fn))

transformed = 0
skipped = []

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # Step 1: Replace NextResponse.json error patterns
    # Pattern: NextResponse.json({ error: '...' }, { status: N })
    # Variant: NextResponse.json({ success: false, error: '...' }, { status: N })
    # Variant: NextResponse.json({ success: false, message: '...' }, { status: N })

    import re

    # Replace: NextResponse.json({ error: "...msg..." }, { status: N })
    content = re.sub(
        r'NextResponse\.json\(\s*\{\s*error:\s*("(?:[^"\\]|\\.)*")\s*\},\s*\{\s*status:\s*(\d+)\s*\}\s*\)',
        r'errorResponse(\1, \2)',
        content
    )

    # Replace: NextResponse.json({ success: false, error: "...msg..." }, { status: N })
    content = re.sub(
        r'NextResponse\.json\(\s*\{\s*success:\s*false\s*,\s*error:\s*("(?:[^"\\]|\\.)*")\s*\},\s*\{\s*status:\s*(\d+)\s*\}\s*\)',
        r'errorResponse(\1, \2)',
        content
    )

    # Replace: NextResponse.json({ success: false, message: "...msg..." }, { status: N })
    content = re.sub(
        r'NextResponse\.json\(\s*\{\s*success:\s*false\s*,\s*message:\s*("(?:[^"\\]|\\.)*")\s*\},\s*\{\s*status:\s*(\d+)\s*\}\s*\)',
        r'errorResponse(\1, \2)',
        content
    )

    # Replace success patterns:
    # NextResponse.json({ success: true, data: X, message: "..." })
    content = re.sub(
        r'NextResponse\.json\(\s*\{\s*success:\s*true\s*,\s*data:\s*(.+?)\s*,\s*message:\s*("(?:[^"\\]|\\.)*")\s*\}\s*\)',
        r'successResponse(\1, \2)',
        content
    )

    # NextResponse.json({ success: true, data: X })
    content = re.sub(
        r'NextResponse\.json\(\s*\{\s*success:\s*true\s*,\s*data:\s*(.+?)\s*\}\s*\)',
        r'successResponse(\1)',
        content
    )

    # NextResponse.json({ success: true, message: "..." })
    content = re.sub(
        r'NextResponse\.json\(\s*\{\s*success:\s*true\s*,\s*message:\s*("(?:[^"\\]|\\.)*")\s*\}\s*\)',
        r'successResponse(null, \1)',
        content
    )

    # NextResponse.json({ success: true })
    content = re.sub(
        r'NextResponse\.json\(\s*\{\s*success:\s*true\s*\}\s*\)',
        r'successResponse(null)',
        content
    )

    # Handle cases with extra properties like { success: true, duration, result }
    # These won't match the simple patterns above, so just warn

    # Step 2: Fix imports
    # Add errorResponse/successResponse import if not present
    if 'errorResponse' in content or 'successResponse' in content:
        if "from '@/lib/api-response'" not in content:
            # Add import after the last import line
            lines = content.split('\n')
            last_import_idx = -1
            for i, line in enumerate(lines):
                if line.startswith('import '):
                    last_import_idx = i
            if last_import_idx >= 0:
                lines.insert(last_import_idx + 1, "import { errorResponse, successResponse } from '@/lib/api-response'")
                content = '\n'.join(lines)

    # Step 3: Remove NextResponse from import if no longer used
    if 'NextResponse' not in content:
        content = re.sub(
            r"import\s*\{\s*NextResponse\s*\}\s*from\s*'next/server';\s*\n?",
            '',
            content
        )
        content = re.sub(
            r"import\s*\{\s*NextRequest\s*,\s*NextResponse\s*\}\s*from\s*'next/server';\s*\n?",
            "import { NextRequest } from 'next/server'\n",
            content
        )

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        transformed += 1
        print(f"TRANSFORMED: {os.path.relpath(filepath, base)}")
    else:
        skipped.append(os.path.relpath(filepath, base))

print(f"\n--- Summary ---")
print(f"Transformed: {transformed}")
print(f"Skipped: {len(skipped)}")
for s in skipped:
    print(f"  SKIP: {s}")
