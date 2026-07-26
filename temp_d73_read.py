import os, subprocess

base = r"D:\mlm-platform-source\mlm-platform\src\app\api\admin"

skipped = [
    r"banners\route.ts", r"categories\route.ts", r"categories\[id]\route.ts",
    r"manual-reward\route.ts", r"orders\route.ts", r"points\void\route.ts",
    r"products\route.ts", r"products\bulk\route.ts", r"products\[id]\route.ts",
    r"products\[id]\duplicate\route.ts", r"recharge\route.ts", r"recharge\[id]\route.ts",
    r"recharge\[id]\audit-logs\route.ts", r"recharge\[id]\review\route.ts",
    r"refunds\[id]\review\route.ts", r"rewards\route.ts",
    r"users\route.ts", r"users\[id]\balance\route.ts",
    r"users\[id]\balance-records\route.ts", r"users\[id]\points\route.ts",
    r"withdrawals\batch-review\route.ts", r"withdrawals\[id]\complete\route.ts",
]

for f in skipped:
    filepath = os.path.join(base, f)
    if not os.path.exists(filepath):
        print(f"NOT FOUND: {f}")
        continue
    with open(filepath, 'r', encoding='utf-8') as fh:
        content = fh.read()
    lines = content.count('\n') + 1
    has_next = 'NextResponse' in content
    has_err = 'errorResponse' in content
    has_suc = 'successResponse' in content
    print(f"FILE: {f}  lines={lines}  hasNextResponse={has_next}  hasErrorResponse={has_err}  hasSuccessResponse={has_suc}")
