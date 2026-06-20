import html
import os
import re


def slugify(value):
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "showcase-card"


def demote_markdown_headings(value):
    # Hidden modal source content should not generate page-level ToC entries.
    return re.sub(r"^#{1,6}\s+(.+)$", r"**\1**", value, flags=re.MULTILINE)


def on_page_markdown(markdown, page, config, files):
    # Only execute on the showcase page.
    if page.file.src_path not in {"user/embeds/showcase.md", "user\\embeds\\showcase.md"}:
        return markdown

    docs_dir = config["docs_dir"]
    blueprints_path = os.path.join(docs_dir, "user", "embeds", "showcase_blueprints.md")
    if not os.path.exists(blueprints_path):
        return markdown

    with open(blueprints_path, "r", encoding="utf-8") as file_obj:
        content = file_obj.read()

    # Split by horizontal rule. Block 0 contains instructions and is ignored.
    blocks = re.split(r"\n(?:---|===|\*\*\*)\s*\n", content)

    toc_headings = []
    cards = []
    details_divs = []
    card_index = 0

    for block in blocks[1:]:
        block = block.strip()
        if not block:
            continue

        title_match = re.search(r"^##\s+(.+)$", block, re.MULTILINE)
        if not title_match:
            continue
        title = title_match.group(1).strip()
        safe_title = html.escape(title)

        image_match = re.search(r"\*\*Image\*\*:\s*!\[[^\]]*\]\(([^)]+)\)", block)
        image_path = image_match.group(1).strip() if image_match else ""

        summary_match = re.search(r"\*\*Summary\*\*:\s*([^\n]+)", block)
        summary = summary_match.group(1).strip() if summary_match else ""
        safe_summary = html.escape(summary)

        code_blocks = list(re.finditer(r"(^````[\s\S]+?^````\s*$)", block, re.MULTILINE))
        if not code_blocks:
            code_blocks = list(re.finditer(r"(^```[\s\S]+?^```\s*$)", block, re.MULTILINE))
        if code_blocks:
            code_block = code_blocks[-1].group(1)
            description_block = block[: code_blocks[-1].start()]
        else:
            code_block = ""
            description_block = block

        outer_fence_match = re.match(r"^````[^\n]*\n([\s\S]*?)\n````\s*$", code_block.strip(), re.MULTILINE)
        if outer_fence_match:
            inner_text = outer_fence_match.group(1).strip("\n")
            code_block = inner_text

        description_lines = []
        for line in description_block.split("\n"):
            stripped = line.strip()
            if (
                stripped.startswith("## ")
                or stripped.startswith("**Image**")
                or stripped.startswith("**Summary**")
                or stripped.startswith("# ")
            ):
                continue
            description_lines.append(line)

        description_text = demote_markdown_headings("\n".join(description_lines).strip())

        # Adjust relative image depth for compiled HTML output path.
        preview_img_src = image_path.replace("../../assets/", "../../../assets/")
        card_slug = slugify(title)

        toc_headings.append(
            f"## {title} {{ #toc-{card_slug} .fc-showcase-toc-anchor data-card-target=\"{card_slug}\" }}"
        )

        card_html = f"""
<!-- {title} Card -->
<div class=\"fc-showcase-card\" id=\"{card_slug}\" data-index=\"{card_index}\">
<div class=\"fc-showcase-card-preview\">
<img src=\"{preview_img_src}\" alt=\"{safe_title}\">
<div class=\"fc-showcase-card-info\">
<h3 class=\"fc-showcase-card-title\">{safe_title}</h3>
<p>{safe_summary}</p>
</div>
</div>
</div>
"""
        cards.append(card_html)

        # Build flat details div (this will be placed at the bottom of the page, completely flat and un-nested)
        # So it will parse perfectly!
        detail_html = f"""
<div id=\"fc-showcase-detail-{card_index}\" class=\"fc-showcase-card-details\" style=\"display: none;\" markdown=\"1\">

<p class=\"fc-modal-title\">{safe_title}</p>

{description_text}

{code_block}

</div>
"""
        details_divs.append(detail_html)
        card_index += 1

    headings_html = "\n\n".join(toc_headings)
    grid_html = "<div class=\"fc-showcase-grid\">\n" + "\n".join(cards) + "\n</div>"
    details_html = "\n".join(details_divs)
    combined_output = headings_html + "\n\n" + grid_html + "\n\n" + details_html

    placeholder = "<!-- SHOWCASE_GRID_PLACEHOLDER -->"
    if placeholder in markdown:
        return markdown.replace(placeholder, combined_output)

    return markdown + "\n\n" + combined_output
