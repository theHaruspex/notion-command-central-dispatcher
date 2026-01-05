# Project Reporter

> **Note:** This directory is a standalone git repository, intended for use as a reusable utility. If present inside another project, it is typically listed in the parent project's `.gitignore` and is not tracked by the parent repo. You can clone, copy, or use this as a submodule in any project. It is safe to version and push independently.

A utility to capture the directory structure and file contents of any project in a single file, for easy LLM ingestion, codebase analysis, or documentation.

## Features
- Recursively scans your project, outputting all file contents and a clean directory tree to a single text file
- Excludes common build, dependency, and config files by default
- Auto-detects the project root by searching for a `.git` directory
- Configurable exclusions (edit the script or add CLI/config support)

## Usage

1. **Clone or copy this directory to your project root, or add as a submodule:**
   ```bash
   git submodule add https://github.com/theHaruspex/project-reporter.git project-reporter
   ```

2. **Run the script from anywhere inside your project:**
   ```bash
   python3 project-reporter/main.py
   ```
   - Output will be written to `project-reporter/file_contents_report.txt`.

## Configuration
- To change which files or directories are excluded, edit the `CONFIG` dictionary at the top of `main.py`.
- You can add support for a config file or CLI arguments if you want more flexibility.

## Notes
- If you do **not** want this tool tracked by your project’s git, add `project-reporter/` to your `.gitignore`.
- If you use as a submodule, update with:
  ```bash
  git submodule update --remote --merge
  ```
- Works with Python 3.7+

## Example Output
- See `project-reporter/file_contents_report.txt` after running the script.

---

*Built to make codebase analysis and LLM ingestion easier for developers.* 