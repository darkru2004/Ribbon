from argparse import ArgumentParser
from base64 import b64encode
import json
import mimetypes
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FILES = {
    "/* INLINE_STYLE */": "style.css",
    "/* INLINE_CATALOG */": "catalog.json",
    "/* INLINE_BACKUP */": "backup.js",
    "/* INLINE_ECONOMY */": "economy.js",
    "/* INLINE_AUDIO */": "audio.js",
    "/* INLINE_APP */": "app.js",
}


def english_template():
    source = (ROOT / "english-dictation-9.html").read_text()
    css = re.search(r"<style>(.*?)</style>", source, re.S).group(1)
    css = css.replace(":root{", ":host{", 1).replace("body{", ".english-shell{", 1)
    body = re.search(r"<main>(.*?)</main>", source, re.S).group(1)
    body = re.sub(r'<header class="masthead">.*?</header>', '', body, count=1, flags=re.S)
    body = body.replace('시험 볼 장을 하나 또는 여러 개 골라 줘. 같은 단어는 한 번만 나와.', '시험 볼 장을 골라 줘. 시험·오답 복습 보상은 하루 최대 15코인이야.')
    body = body.replace('<p id="result-note"', '<p id="coin-reward" class="coin-reward" role="status"></p>\n  <p id="result-note"', 1)
    body = body.replace('<div id="transcript" class="transcript"', '<button type="button" class="subtle" id="use-keyboard">키보드로 쓰기</button>\n    <div id="transcript" class="transcript"', 1)
    body = body.replace('기록과 단어장은 이 브라우저에 저장돼. 파일을 옮길 때는 백업을 가져가면 돼.', '기존 단어장 파일에서 만든 JSON도 가져올 수 있어. 가져온 시험 기록은 코인 보상에 포함되지 않아.')
    theme = (ROOT / "english-theme.css").read_text()
    return f"<style>{css}\n{theme}</style><div class=\"english-shell\"><main>{body}</main></div>"


def english_script():
    source = (ROOT / "english-dictation-9.html").read_text()
    script = re.search(r"<script>(.*?)</script>", source, re.S).group(1)
    script = script.replace("document.getElementById(id)", "root.getElementById(id)", 1)
    pointer_handler = "ink.addEventListener('pointerdown', event => {"
    if script.count(pointer_handler) != 1:
        raise ValueError("Unable to find the English pen input handler.")
    script = script.replace(pointer_handler, pointer_handler + "\n  if (event.pointerType !== 'pen') return;")
    script = re.sub(r"(\w+)\.replaceChildren\(\);", r"\1.textContent = '';", script)
    save_body = "  persistBook({...book, history: [record, ...book.history]});"
    if script.count(save_body) != 1:
        raise ValueError("Unable to attach the English result hook.")
    script = script.replace(save_body, save_body + "\n  settleReward(record);")
    script = script.replace("  resultSaved = false;\n", "  resultSaved = false;\n  byId('coin-reward').textContent = '';\n")
    script = re.sub(r"readBook\(\);\s*loadEditor\(\);\s*openHome\(false\);", (ROOT / "english-bridge.js").read_text().strip(), script)
    return "function mountRibbonEnglish(root, reward) {\n" + script + "\n}\n"


def build(output, external=False):
    catalog = json.loads((ROOT / "catalog.json").read_text())
    paths = set()

    def collect(value):
        if isinstance(value, str) and value.startswith("assets/"):
            paths.add(value)
        elif isinstance(value, dict):
            for part in value.values():
                collect(part)
        elif isinstance(value, list):
            for part in value:
                collect(part)

    collect(catalog)
    assets = {}
    for path in sorted(paths):
        file = ROOT / path
        if not file.is_file():
            raise FileNotFoundError(file)
        if not external:
            mime, _ = mimetypes.guess_type(file.name)
            if file.suffix == ".ogg":
                mime = "audio/ogg"
            assets[path] = f"data:{mime};base64,{b64encode(file.read_bytes()).decode('ascii')}"
    html = (ROOT / "index.template.html").read_text()
    for marker, filename in FILES.items():
        content = (ROOT / filename).read_text()
        if filename == "catalog.json":
            content = content.replace("<", "\\u003c")
        html = html.replace(marker, content)
    html = html.replace("/* INLINE_ENGLISH_TEMPLATE */", english_template())
    html = html.replace("/* INLINE_ENGLISH_APP */", english_script())
    html = html.replace("/* INLINE_ART */", json.dumps(assets, separators=(",", ":")))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html)


if __name__ == "__main__":
    parser = ArgumentParser(description="Build the offline Ribbon Atelier dressing room.")
    parser.add_argument("output", nargs="?", type=Path, default=ROOT / "Ribbon-Atelier.html")
    parser.add_argument("--external", action="store_true", help="Keep PNG and WebP files beside the HTML.")
    args = parser.parse_args()
    build(args.output, args.external)
