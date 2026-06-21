import os
import shutil
import yaml

def default_constructor(loader, tag_suffix, node):
    if isinstance(node, yaml.MappingNode):
        return loader.construct_mapping(node)
    if isinstance(node, yaml.SequenceNode):
        return loader.construct_sequence(node)
    return loader.construct_scalar(node)

yaml.SafeLoader.add_multi_constructor('', default_constructor)

def main():
    print("Generating SEO assets (Markdown alternates and LLM files)...")
    
    # 1. Read mkdocs.yml to get config options like site_url
    with open("mkdocs.yml", "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)
        
    site_url = config.get("site_url", "https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/")
    if not site_url.endswith("/"):
        site_url += "/"
        
    site_dir = "site"
    docs_dir = "docs"
    
    if not os.path.exists(site_dir):
        print(f"Error: Site build directory '{site_dir}' does not exist. Run 'mkdocs build' first.")
        return

    # 2. Copy markdown alternates
    # Walk the docs/ directory and copy each .md file to its corresponding site/ folder as index.md
    for root, dirs, files in os.walk(docs_dir):
        # Skip overrides directory as it contains layout files, not docs
        if "overrides" in root.split(os.sep):
            continue
            
        for file in files:
            if not file.endswith(".md"):
                continue
                
            src_file_path = os.path.join(root, file)
            rel_path = os.path.relpath(src_file_path, docs_dir)
            
            # Determine target directory in site/
            # e.g., index.md -> site/index.md
            # e.g., getting_started.md -> site/getting_started/index.md
            # e.g., user/guides/quick-workflows.md -> site/user/guides/quick-workflows/index.md
            rel_path_no_ext = os.path.splitext(rel_path)[0]
            
            if rel_path_no_ext == "index":
                dest_file_path = os.path.join(site_dir, "index.md")
            elif rel_path_no_ext.endswith(f"{os.sep}index") or rel_path_no_ext.endswith("/index"):
                # handles cases where file is user/index.md
                parent_dir = os.path.dirname(rel_path_no_ext)
                dest_file_path = os.path.join(site_dir, parent_dir, "index.md")
            else:
                dest_file_path = os.path.join(site_dir, rel_path_no_ext, "index.md")
                
            # Create destination folder if it doesn't exist
            os.makedirs(os.path.dirname(dest_file_path), exist_ok=True)
            
            # Copy file
            shutil.copy2(src_file_path, dest_file_path)

    print("Successfully copied all Markdown alternates to build output.")
    
    # 3. Generate llms.txt and llms-full.txt
    # We will write these files directly into the site/ directory.
    # llms.txt is a curated guide of important links and descriptions.
    # llms-full.txt is a combined markdown of all documentation pages in order of the navigation.
    
    nav = config.get("nav", [])
    
    def extract_nav_items(nav_list):
        items = []
        for item in nav_list:
            if isinstance(item, dict):
                for key, val in item.items():
                    if isinstance(val, list):
                        items.extend(extract_nav_items(val))
                    elif isinstance(val, str):
                        items.append((key, val))
            elif isinstance(item, str):
                items.append((item.split("/")[-1].replace(".md", "").title(), item))
        return items

    nav_items = extract_nav_items(nav)
    
    # Generate llms.txt content
    llms_lines = [
        "# Full Calendar Remastered for Obsidian",
        "",
        "Professional calendar orchestration for Obsidian. Keep your schedule, events, and plans directly inside your local offline-first vault, and sync with Google Calendar, Outlook, CalDAV, and ICS providers.",
        "",
        "## Key Documentation Pages",
        ""
    ]
    
    summaries = {
        "index.md": "Introduction to the plugin, core features, and quick index.",
        "whats_new.md": "What's new in the latest release, including key features and updates.",
        "changelog.md": "Complete changelog with version history and detailed fixes.",
        "getting_started.md": "Onboarding guide: installation, creating your first calendar, and basic commands.",
        "user/calendars/index.md": "Overview of all supported calendar types (local & remote).",
        "user/calendars/local.md": "Full Note Calendars: store events in dedicated markdown notes.",
        "user/calendars/dailynote.md": "Daily Note Calendars: track events directly inside your daily notes.",
        "user/calendars/ics.md": "ICS Integration: subscribe to read-only remote and local iCalendar feeds.",
        "user/calendars/caldav.md": "CalDAV Integration: two-way sync with iCloud, Fastmail, and nextcloud.",
        "user/calendars/gcal.md": "Google Calendar: full two-way synchronization setup and usage.",
        "user/calendars/tasks-plugin-integration.md": "Tasks Plugin: display tasks as interactive calendar events.",
        "user/events/manage.md": "Event creation, editing, drag-and-drop, and deletion guide.",
        "user/events/recurring.md": "Recurring events and setting up exceptions or overrides.",
        "user/events/timezones.md": "Timezone support: local vs. calendar-specific timezones.",
        "user/views/workspaces.md": "Setting up custom workspaces and calendar views.",
        "user/features/nlp.md": "Natural Language Processing (NLP) for quick event creation.",
        "user/features/tasks-backlog.md": "Unified task backlog panel and sidebar details.",
        "user/embeds/index.md": "Embedded calendars: render calendars inside any markdown note.",
        "user/chrono_analyser/index.md": "Chrono Analyser: time tracking, charts, and productivity analytics.",
        "user/features/api.md": "Developer API and CLI command specifications.",
        "architecture/system/overview.md": "System design overview of the cache, sync, and interop layers.",
        "architecture/system/eventcache.md": "Deep dive into event cache state machine and performance."
    }
    
    for title, filepath in nav_items:
        filepath_clean = filepath.replace(".md", "")
        if filepath_clean == "index":
            url = site_url
        elif filepath_clean.endswith("/index") or filepath_clean.endswith(f"{os.sep}index"):
            url = site_url + filepath_clean[:-5]
        else:
            url = site_url + filepath_clean + "/"
            
        summary = summaries.get(filepath, f"Documentation page for {title}.")
        llms_lines.append(f"- [{title}]({url}): {summary}")
        
    llms_content = "\n".join(llms_lines)
    
    with open(os.path.join(site_dir, "llms.txt"), "w", encoding="utf-8") as f:
        f.write(llms_content)
    print("Generated site/llms.txt")
    
    # Generate llms-full.txt
    full_doc_parts = [
        "# Full Calendar Remastered - Full Documentation",
        "",
        "This file contains the complete, flattened documentation for the Full Calendar Remastered Obsidian plugin.",
        "",
        "---",
        ""
    ]
    
    for title, filepath in nav_items:
        full_path = os.path.join(docs_dir, filepath)
        if not os.path.exists(full_path):
            continue
            
        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()
            
        # Clean frontmatter if present
        if content.startswith("---"):
            end_fm = content.find("---", 3)
            if end_fm != -1:
                content = content[end_fm+3:].strip()
                
        full_doc_parts.append(f"# Section: {title}")
        full_doc_parts.append(f"Source file: `docs/{filepath}`")
        full_doc_parts.append("")
        full_doc_parts.append(content)
        full_doc_parts.append("\n\n---\n\n")
        
    llms_full_content = "\n".join(full_doc_parts)
    with open(os.path.join(site_dir, "llms-full.txt"), "w", encoding="utf-8") as f:
        f.write(llms_full_content)
    print("Generated site/llms-full.txt")
    
if __name__ == "__main__":
    main()
