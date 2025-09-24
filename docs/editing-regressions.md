# Editing Regression Checklist

This checklist covers the critical on-canvas editing flows for disk-backed projects. Each section includes reproducible steps and guidance on capturing a reference GIF from the local sandbox pipeline.

> **Recording note:** Animated recordings are not checked into the repository to keep pull requests binary-free. Capture the flow locally (QuickTime + `gifify`, ScreenToGif, etc.) and save the output under `docs/images/regressions/` when preparing external documentation or release materials.

## Text Editing

> Recording placeholder: `docs/images/regressions/text-edit.gif`

1. Import a project from disk and open the canvas view.
2. Select a text node rendered on the preview frame.
3. Enter inline edit mode and replace the copy.
4. Verify the change is written back to the originating source file (`app/page.tsx` in the sample fixture).
5. Reload the frame to confirm the update persists through hot reload.

## Style Update (Tailwind)

> Recording placeholder: `docs/images/regressions/style-edit.gif`

1. With the local sandbox running, select a node with an existing `className`.
2. Apply a spacing change (e.g., padding `1rem`) from the design panel.
3. Confirm the Tailwind utility is merged into the `className` without dropping existing classes.
4. Reload the preview and check the DOM reflects the new class.
5. Inspect the corresponding source file to ensure the utility is persisted.

## Layout Change (Flex/Grid)

> Recording placeholder: `docs/images/regressions/layout-edit.gif`

1. Choose a container element on the canvas.
2. Toggle the layout control to `grid` and specify three columns.
3. Verify the sandbox injects both `grid` and `grid-cols-3` classes.
4. Confirm siblings reflow on the live preview without manual reload.
5. Inspect the source file to ensure the layout classes are committed.

## Source Map Validation

- Confirm template nodes expose `startTag` and `endTag` positions when indexing the local project.
- Cross-check that line numbers map to the same JSX element in the updated source file after each edit.
- If the mapping drifts, rerun the importer so the preprocessing step (`addOidsToAst`) refreshes the metadata.
