# macOS Permissions & Storage Notes

The Onlook client expects all local workspace data to live beneath
`~/Onlook Projects`. macOS privacy controls occasionally block automated
access to this folder, especially when it contains spaces or large
binary assets. The sections below outline how to prepare the directory
and how to recover from common permission issues.

## Projects root layout

1. Create the workspace root, quoting the path so the space is preserved:
   ```bash
   mkdir -p "$HOME/Onlook Projects"
   ```
2. Confirm the expected structure exists. Each project directory should
   contain:
   ```text
   <project>/
     meta.json
     files/
     canvases/
     conversations/
     previews/
     assets/
   ```
3. If you relocate the workspace, update `ONLOOK_PROJECTS_DIR` in
   `apps/web/client/.env.local` to the new absolute path (quotes are
   supported). Restart the dev server so Bun picks up the change.

## Full Disk Access

macOS protects user folders by default. When Onlook or your terminal
tries to read/write `~/Onlook Projects` without explicit approval, the
operation fails with `EACCES`/`EPERM`.

1. Open **System Settings → Privacy & Security → Full Disk Access**.
2. Unlock the settings pane, then add the app that is running Onlook
   (e.g. **Terminal**, **iTerm**, **Warp**, or the packaged Onlook app).
3. Enable the checkbox next to the app, then restart the app to apply
   the permission.
4. Re-run the Onlook command; the LocalStorage layer will confirm access
   and proceed.

If the folder still appears locked, verify that the workspace root is
not located inside a cloud-synced or managed directory that imposes its
own restrictions.

## Spotlight indexing

Spotlight may briefly lock newly-created files for indexing, which can
slow down hot reload or file-watcher driven workflows.

- To exclude the workspace from indexing, open **System Settings → Siri
  & Spotlight → Spotlight Privacy** and add `~/Onlook Projects`.
- Alternatively, disable indexing from the terminal:
  ```bash
  sudo mdutil -i off "$HOME/Onlook Projects"
  ```
  Re-enable later with `sudo mdutil -i on "$HOME/Onlook Projects"` if
  you rely on Finder search.

## Large assets and symlinks

Design exports or other binary assets above ~200 MB can slow down backups
and inflate repository copies. Store heavy files elsewhere (for example,
`~/Media/OnlookAssets`) and expose them inside a project with a symlink:

```bash
ln -s "~/Media/OnlookAssets/clip.mov" "~/Onlook Projects/<project>/assets/clip.mov"
```

The LocalStorage helper will surface a reminder when it detects large
assets and will link back to this document for guidance.
