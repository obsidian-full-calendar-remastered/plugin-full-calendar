import os
import re

def on_page_markdown(markdown, page, config, files):
    # Only execute on the showcase page
    if page.file.src_path != "user/embeds/showcase.md" and page.file.src_path != "user\\embeds\\showcase.md":
        return markdown

    # Path to the blueprints data file
    docs_dir = config['docs_dir']
    blueprints_path = os.path.join(docs_dir, "user", "embeds", "showcase_blueprints.md")

    if not os.path.exists(blueprints_path):
        return markdown

    with open(blueprints_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Split by horizontal rule ('---') to get each blueprint card
    # The first block (index 0) is the header/instructions section and is skipped.
    blocks = re.split(r'\n(?:---|===|\*\*\*)\s*\n', content)

    cards = []
    details_divs = []
    card_index = 0

    for block in blocks[1:]:
        block = block.strip()
        if not block:
            continue

        # Parse the title from the markdown heading (## Title)
        title_match = re.search(r'^##\s+(.+)$', block, re.MULTILINE)
        if not title_match:
            continue
        title = title_match.group(1).strip()

        # Parse image path from standard markdown syntax ![Alt](path)
        image_match = re.search(r'\*\*Image\*\*:\s*!\[[^\]]*\]\(([^)]+)\)', block)
        image_path = image_match.group(1).strip() if image_match else ""

        # Parse summary
        summary_match = re.search(r'\*\*Summary\*\*:\s*([^\n]+)', block)
        summary = summary_match.group(1).strip() if summary_match else ""

        # Parse the last code block (usually the nested code block to copy)
        code_blocks = list(re.finditer(r'(^(?:````|```)[\s\S]+?^(?:````|```))', block, re.MULTILINE))
        code_block = ""
        if code_blocks:
            code_block = code_blocks[-1].group(1)
            # Remove the code block from description area
            description_block = block[:code_blocks[-1].start()]
        else:
            description_block = block

        # Extract remaining description text, filtering out metadata headers
        description_lines = []
        for line in description_block.split('\n'):
            stripped = line.strip()
            if stripped.startswith('## ') or stripped.startswith('**Image**') or stripped.startswith('**Summary**') or stripped.startswith('# '):
                continue
            description_lines.append(line)
        
        description_text = '\n'.join(description_lines).strip()

        # Rewrite relative image path for compiled HTML depth (from ../../assets to ../../../assets)
        preview_img_src = image_path.replace('../../assets/', '../../../assets/')

        card_html = f"""
  <!-- {title} Card -->
  <div class="fc-showcase-card" data-index="{card_index}">
    <div class="fc-showcase-card-preview">
      <img src="{preview_img_src}" alt="{title}">
      <div class="fc-showcase-card-info">
        <h3>{title}</h3>
        <p>{summary}</p>
      </div>
    </div>
  </div>
"""
        cards.append(card_html)

        # Build flat details div (this will be placed at the bottom of the page, completely flat and un-nested)
        # So it will parse perfectly!
        detail_html = f"""
<div id="fc-showcase-detail-{card_index}" class="fc-showcase-card-details" style="display: none;" markdown="1">

## {title}

{description_text}

#### Configuration Code

{code_block}

</div>
"""
        details_divs.append(detail_html)
        
        card_index += 1

    grid_html = '<div class="fc-showcase-grid">\n' + '\n'.join(cards) + '\n</div>'
    details_html = '\n'.join(details_divs)
    
    combined_output = grid_html + '\n\n' + details_html

    # Inject into the placeholder comment
    placeholder = '<!-- SHOWCASE_GRID_PLACEHOLDER -->'
    if placeholder in markdown:
        return markdown.replace(placeholder, combined_output)
    else:
        return markdown + '\n\n' + combined_output
