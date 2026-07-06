"""Standalone demo: machine translation (MarianMT via CTranslate2).

    python scripts/nlp/translate_demo.py

Translates sample Hindi and Thai sentences into English (the product direction)
and one English sentence into Hindi (to show the module both ways). Requires the
converted models — run `python scripts/download_models.py` first.
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from app.nlp.translate import ModelUnavailableError, translate  # noqa: E402

# (source, target, text). Hindi/Thai → English is what scribe uses in-product;
# the English → Hindi line rounds out the standalone translation module.
SAMPLES: list[tuple[str, str, str]] = [
    ("hi", "en", "नमस्ते, आज की बैठक में आपका स्वागत है।"),
    ("hi", "en", "हमें अगले सप्ताह तक बजट को अंतिम रूप देना होगा।"),
    ("th", "en", "สวัสดีครับ ยินดีต้อนรับสู่การประชุมวันนี้"),
    ("th", "en", "เราต้องส่งรายงานให้เสร็จภายในวันศุกร์"),
    ("en", "hi", "Please finalize the budget before Friday."),
]


def main() -> None:
    print("=" * 60)
    print("TRANSLATION DEMO (MarianMT / CTranslate2, int8)")
    print("=" * 60)
    try:
        for src, tgt, text in SAMPLES:
            out = translate(text, src, tgt)
            print(f"\n[{src} → {tgt}]")
            print(f"  in : {text}")
            print(f"  out: {out}")
    except ModelUnavailableError as err:
        print(f"\n{err}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
