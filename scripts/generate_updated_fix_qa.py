from pathlib import Path

source = Path('.github/workflows/fix-and-qa.yml').read_text()
source = source.replace("'iOS Notes へようこそ 📝'", "'週末の買い物リスト 🛒'")
source = source.replace(
    "if (hoursUntilDue < 20 || hoursUntilDue > 28)",
    "if (hoursUntilDue < 3 || hoursUntilDue > 7)",
)
source = source.replace(
    "Expected about 24h until sample reminder",
    "Expected about 5h until sample reminder",
)
out = Path('generated/fix-and-qa.yml')
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(source)
