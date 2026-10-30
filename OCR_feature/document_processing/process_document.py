"""CLI entrypoint for document processing (Phase 7)."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from document_processing.config import ProcessorConfig
from document_processing.processor import DocumentProcessor


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Process a document/URL into DocumentResult JSON + Markdown",
    )
    parser.add_argument(
        "input_path",
        nargs="?",
        help="Path to the input document (or use --url)",
    )
    parser.add_argument(
        "--url",
        default=None,
        help="HTTP(S)/file URL or local path treated as URL input",
    )
    parser.add_argument("--use-ocr", action="store_true", default=True)
    parser.add_argument("--no-ocr", action="store_true")
    parser.add_argument(
        "--use-smolvlm",
        action="store_true",
        default=False,
        help="Enable optional local SmolVLM visual fallback",
    )
    parser.add_argument(
        "--allow-url-network",
        action="store_true",
        default=False,
        help="Allow outbound HTTP(S) fetches (disabled by default)",
    )
    parser.add_argument(
        "--output",
        "--out-dir",
        dest="out_dir",
        default=".",
        help="Directory for output files",
    )
    parser.add_argument(
        "--json",
        dest="write_json",
        action="store_true",
        default=True,
        help="Write output.json (default)",
    )
    parser.add_argument(
        "--no-json",
        dest="write_json",
        action="store_false",
        help="Skip writing output.json",
    )
    parser.add_argument(
        "--markdown",
        dest="write_markdown",
        action="store_true",
        default=True,
        help="Write output.md (default)",
    )
    parser.add_argument(
        "--no-markdown",
        dest="write_markdown",
        action="store_false",
        help="Skip writing output.md",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Debug logging",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if not args.input_path and not args.url:
        parser.error("Provide input_path or --url")

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(message)s",
    )

    use_ocr = False if args.no_ocr else args.use_ocr
    config = ProcessorConfig(
        use_ocr=use_ocr,
        use_smolvlm=args.use_smolvlm,
        enable_vision=args.use_smolvlm,
        allow_url_network=args.allow_url_network,
    )
    processor = DocumentProcessor(config=config)

    if args.url:
        result = processor.process_url(args.url)
        input_label = args.url
    else:
        result = processor.process(args.input_path)
        input_label = args.input_path

    table_count = len(result.tables)
    image_count = sum(len(p.images) for p in result.pages)
    preview = (result.full_text or "")[:400].replace("\n", " ")

    print(f"input              : {input_label}")
    print(f"detected_file_type : {result.file_type}")
    print(f"processing_route   : {' -> '.join(result.processing_metadata.processing_route)}")
    print(f"ocr_used           : {result.processing_metadata.ocr_used}")
    print(f"vlm_used           : {result.processing_metadata.vision_used}")
    print(f"pages              : {result.metadata.page_count}")
    print(f"tables             : {table_count}")
    print(f"images             : {image_count}")
    print(f"status             : {result.processing_status.value}")
    if result.processing_metadata.warnings:
        print(f"warnings           : {'; '.join(result.processing_metadata.warnings)}")
    if result.error:
        print(f"error              : {result.error.code} — {result.error.message}")
    print(f"text_preview       : {preview!r}")

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    if args.write_json:
        json_path = out_dir / "output.json"
        json_path.write_text(result.model_dump_json(indent=2), encoding="utf-8")
        print(f"output_json        : {json_path.resolve()}")
    if args.write_markdown:
        md_path = out_dir / "output.md"
        md_path.write_text(result.markdown or result.full_text or "", encoding="utf-8")
        print(f"output_md          : {md_path.resolve()}")

    return 0 if result.processing_status.value != "failed" else 1


if __name__ == "__main__":
    sys.exit(main())
